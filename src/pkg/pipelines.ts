import {
  DatalabAbortError,
  DatalabPipelineError,
  DatalabTimeoutError,
  isDatalabError,
} from './errors'
import { delay, type Requester } from './http'
import type {
  Pipeline,
  PipelineExecution,
  PipelineExecutionList,
  PipelineExecutionListOptions,
  PipelineList,
  PipelineListOptions,
  PipelineRunAndPollOptions,
  PipelineRunOptions,
  PipelineRunSource,
  PipelineStep,
  PipelineVersion,
  PipelineVersionList,
  ZodPipelineRunOptions,
} from './pipeline-types'
import type { z } from 'zod'
import type { PollOptions } from './types'
import {
  isZodPageSchema,
  toJsonSchema,
  unwrapDatalabResult,
} from './utils'

type UnknownRecord = Record<string, unknown>

export class PipelineClient {
  constructor(private readonly requester: Requester) {}

  async list(options: PipelineListOptions = {}): Promise<PipelineList> {
    const query = queryString({
      saved_only: options.savedOnly ?? true,
      include_archived: options.includeArchived ?? false,
      limit: options.limit ?? 50,
      offset: options.offset ?? 0,
    })
    const result = await this.requester.request<UnknownRecord>(
      `/pipelines?${query}`
    )
    return {
      pipelines: array(result.pipelines).map(normalizePipeline),
      total: number(result.total),
    }
  }

  async get(pipelineId: string): Promise<Pipeline> {
    const result = await this.requester.request<UnknownRecord>(
      `/pipelines/${pipelineId}`
    )
    return normalizePipeline(result)
  }

  async create(options: {
    steps: PipelineStep[]
    reuseDraft?: boolean
  }): Promise<Pipeline> {
    validateSteps(options.steps)
    const result = await this.json<UnknownRecord>('/pipelines', 'POST', {
      steps: options.steps.map(stepToWire),
      reuse_draft: options.reuseDraft ?? false,
    })
    return normalizePipeline(result)
  }

  async update(
    pipelineId: string,
    options: { steps: PipelineStep[] }
  ): Promise<Pipeline> {
    validateSteps(options.steps)
    const result = await this.json<UnknownRecord>(
      `/pipelines/${pipelineId}`,
      'PUT',
      { steps: options.steps.map(stepToWire) }
    )
    return normalizePipeline(result)
  }

  async save(
    pipelineId: string,
    options: { name: string }
  ): Promise<Pipeline> {
    const result = await this.json<UnknownRecord>(
      `/pipelines/${pipelineId}/save`,
      'PUT',
      { name: options.name }
    )
    return normalizePipeline(result)
  }

  async publish(
    pipelineId: string,
    options: { description?: string } = {}
  ): Promise<PipelineVersion> {
    const result = await this.json<UnknownRecord>(
      `/pipelines/${pipelineId}/versions`,
      'POST',
      options
    )
    return normalizeVersion(result)
  }

  async listVersions(pipelineId: string): Promise<PipelineVersionList> {
    const result = await this.requester.request<UnknownRecord>(
      `/pipelines/${pipelineId}/versions`
    )
    return {
      versions: array(result.versions).map(normalizeVersion),
      total: number(result.total),
    }
  }

  async discardDraft(
    pipelineId: string,
    version?: number
  ): Promise<Pipeline> {
    const result = await this.json<UnknownRecord>(
      `/pipelines/${pipelineId}/discard`,
      'POST',
      version === undefined ? {} : { version }
    )
    return normalizePipeline(result)
  }

  archive(pipelineId: string): Promise<unknown> {
    return this.json(`/pipelines/${pipelineId}/archive`, 'POST', {})
  }

  unarchive(pipelineId: string): Promise<unknown> {
    return this.json(`/pipelines/${pipelineId}/unarchive`, 'POST', {})
  }

  async submit(
    pipelineId: string,
    source: PipelineRunSource,
    options: PipelineRunOptions = {},
    signal?: AbortSignal
  ): Promise<PipelineExecution> {
    const form = new FormData()
    appendSource(form, source)
    appendRunOptions(form, options)
    const result = await this.requester.request<UnknownRecord>(
      `/pipelines/${pipelineId}/run`,
      { method: 'POST', body: form, signal }
    )
    return normalizeExecution(result)
  }

  async getExecution(executionId: string): Promise<PipelineExecution> {
    const result = await this.requester.request<UnknownRecord>(
      `/pipelines/executions/${executionId}`
    )
    return normalizeExecution(result)
  }

  async waitForExecution(
    executionId: string,
    options: PollOptions = {}
  ): Promise<PipelineExecution> {
    const intervalMs = options.intervalMs ?? 2_000
    const timeoutMs = options.timeoutMs ?? 60_000
    const timeoutController = new AbortController()
    const timeoutError = new DatalabTimeoutError(timeoutMs)
    const timeout = setTimeout(
      () => timeoutController.abort(timeoutError),
      timeoutMs
    )
    const signal = options.signal
      ? AbortSignal.any([options.signal, timeoutController.signal])
      : timeoutController.signal

    try {
      while (true) {
        const raw = await this.requester.request<UnknownRecord>(
          `/pipelines/executions/${executionId}`,
          { signal }
        )
        const execution = normalizeExecution(raw)

        if (execution.status === 'failed') {
          const stepErrors = execution.steps
            .map(step => step.errorMessage)
            .filter(Boolean)
          throw new DatalabPipelineError(
            stepErrors.join('; ') || 'Datalab pipeline execution failed',
            raw
          )
        }
        if (
          execution.status === 'completed' ||
          execution.status === 'completed_with_errors'
        ) {
          return execution
        }
        await delay(intervalMs, signal)
      }
    } catch (error) {
      if (isDatalabError(error)) throw error
      if (timeoutController.signal.aborted) throw timeoutError
      if (options.signal?.aborted) {
        throw new DatalabAbortError(undefined, options.signal.reason)
      }
      throw error
    } finally {
      clearTimeout(timeout)
    }
  }

  run<T extends z.ZodObject>(
    pipelineId: string,
    source: PipelineRunSource,
    options: ZodPipelineRunOptions<T>
  ): Promise<z.output<T>>
  run(
    pipelineId: string,
    source: PipelineRunSource,
    options?: PipelineRunAndPollOptions
  ): Promise<PipelineExecution>
  async run<T extends z.ZodObject>(
    pipelineId: string,
    source: PipelineRunSource,
    options: PipelineRunAndPollOptions | ZodPipelineRunOptions<T> = {}
  ): Promise<PipelineExecution | z.output<T>> {
    const execution = await this.submit(
      pipelineId,
      source,
      options,
      options.signal
    )
    const completed = await this.waitForExecution(
      execution.executionId,
      options
    )

    if ('pageSchema' in options) {
      const stepIndex =
        options.resultStepIndex ?? completed.steps.at(-1)?.stepIndex
      if (stepIndex === undefined) {
        throw new DatalabPipelineError(
          'Pipeline completed without any result steps',
          completed as unknown as UnknownRecord
        )
      }
      const result = await this.getStepResult(
        completed.executionId,
        stepIndex,
        options.signal
      )
      return options.pageSchema.parse(unwrapDatalabResult(result))
    }

    return completed
  }

  getStepResult<T = unknown>(
    executionId: string,
    stepIndex: number,
    signal?: AbortSignal
  ): Promise<T> {
    return this.requester.request<T>(
      `/pipelines/executions/${executionId}/steps/${stepIndex}/result`,
      { signal }
    )
  }

  async listExecutions(
    pipelineId: string,
    options: PipelineExecutionListOptions = {}
  ): Promise<PipelineExecutionList> {
    const query = queryString({
      limit: options.limit ?? 20,
      offset: options.offset ?? 0,
    })
    const result = await this.requester.request<UnknownRecord>(
      `/pipelines/${pipelineId}/executions?${query}`
    )
    return {
      executions: array(result.executions).map(normalizeExecution),
      total: number(result.total),
    }
  }

  private json<T>(
    path: string,
    method: 'POST' | 'PUT',
    body: unknown
  ): Promise<T> {
    return this.requester.request<T>(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }
}

function appendSource(form: FormData, source: PipelineRunSource) {
  if (source instanceof Blob) form.append('file', source)
  else if ('file' in source) {
    if (source.filename) form.append('file', source.file, source.filename)
    else form.append('file', source.file)
  } else form.append('file_url', source.url)
}

function appendRunOptions(form: FormData, options: PipelineRunOptions) {
  const fields: Record<string, unknown> = {
    page_range: options.pageRange,
    output_format: options.outputFormat,
    run_evals: options.runEvals,
    skip_cache: options.skipCache,
    checkpoint_id: options.checkpointId,
    webhook_url: options.webhookUrl,
    processing_location: options.processingLocation,
    version: options.version,
  }
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) form.append(key, String(value))
  }
  for (const step of options.runEvalsSteps ?? []) {
    form.append('run_evals_steps', step)
  }
}

function validateSteps(steps: PipelineStep[]) {
  if (steps.length === 0)
    throw new Error('A pipeline needs at least one step')
  if (steps[0]?.type === 'fill' && steps.length !== 1) {
    throw new Error('A fill pipeline cannot contain other steps')
  }
  if (steps[0]?.type !== 'convert' && steps[0]?.type !== 'fill') {
    throw new Error('A pipeline must start with convert or fill')
  }
  const extractIndex = steps.findIndex(step => step.type === 'extract')
  if (extractIndex !== -1 && extractIndex !== steps.length - 1) {
    throw new Error('The extract step must be last')
  }
}

function stepToWire(step: PipelineStep): UnknownRecord {
  const settings: UnknownRecord = {}
  for (const [key, value] of Object.entries(step.settings ?? {})) {
    const wireKey = snakeCase(key)
    const normalizedValue = isZodPageSchema(value)
      ? toJsonSchema(value)
      : value
    settings[wireKey] =
      (wireKey === 'page_schema' || wireKey === 'segmentation_schema') &&
      typeof normalizedValue === 'object'
        ? JSON.stringify(normalizedValue)
        : normalizedValue
  }
  return {
    type: step.type,
    settings,
    custom_processor_id: step.customProcessorId ?? null,
    eval_rubric_id: step.evalRubricId ?? null,
  }
}

function normalizePipeline(value: UnknownRecord): Pipeline {
  return {
    id: number(value.id),
    pipelineId: string(value.pipeline_id ?? value.pipelineId),
    name: nullableString(value.name),
    steps: array(value.steps).map(normalizeStep),
    isSaved: boolean(value.is_saved ?? value.isSaved),
    archived: boolean(value.archived),
    activeVersion: number(value.active_version ?? value.activeVersion),
    created: nullableString(value.created),
    updated: nullableString(value.updated),
    reused: boolean(value.reused),
  }
}

function normalizeStep(value: UnknownRecord): PipelineStep {
  return {
    type: string(value.type) as PipelineStep['type'],
    settings: record(value.settings),
    customProcessorId: nullableString(
      value.custom_processor_id ?? value.customProcessorId
    ),
    evalRubricId: nullableNumber(
      value.eval_rubric_id ?? value.evalRubricId
    ),
  }
}

function normalizeVersion(value: UnknownRecord): PipelineVersion {
  return {
    id: number(value.id),
    version: number(value.version),
    steps: array(value.steps).map(normalizeStep),
    description: nullableString(value.description),
    created: nullableString(value.created),
  }
}

function normalizeExecution(value: UnknownRecord): PipelineExecution {
  return {
    executionId: string(value.execution_id ?? value.executionId),
    pipelineId: string(value.pipeline_id ?? value.pipelineId),
    pipelineVersion: number(
      value.pipeline_version ?? value.pipelineVersion
    ),
    status: string(value.status) as PipelineExecution['status'],
    steps: array(value.steps).map(step => ({
      stepIndex: number(step.step_index ?? step.stepIndex),
      stepType: string(step.step_type ?? step.stepType),
      status: string(
        step.status
      ) as PipelineExecution['steps'][number]['status'],
      lookupKey: nullableString(step.lookup_key ?? step.lookupKey),
      resultUrl: nullableString(step.result_url ?? step.resultUrl),
      startedAt: nullableString(step.started_at ?? step.startedAt),
      finishedAt: nullableString(step.finished_at ?? step.finishedAt),
      errorMessage: nullableString(
        step.error_message ?? step.errorMessage
      ),
      sourceStepType: nullableString(
        step.source_step_type ?? step.sourceStepType
      ),
      checkpointId: nullableString(
        step.checkpoint_id ?? step.checkpointId
      ),
      checkpointReused: nullableBoolean(
        step.checkpoint_reused ?? step.checkpointReused
      ),
    })),
    startedAt: nullableString(value.started_at ?? value.startedAt),
    completedAt: nullableString(value.completed_at ?? value.completedAt),
    created: nullableString(value.created),
    configSnapshot: nullableRecord(
      value.config_snapshot ?? value.configSnapshot
    ),
    inputConfig: nullableRecord(value.input_config ?? value.inputConfig),
    rateBreakdown: nullableRecord(
      value.rate_breakdown ?? value.rateBreakdown
    ),
  }
}

function queryString(values: Record<string, string | number | boolean>) {
  return new URLSearchParams(
    Object.entries(values).map(([key, value]) => [key, String(value)])
  ).toString()
}

function snakeCase(value: string) {
  return value.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)
}

function record(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {}
}

function nullableRecord(value: unknown): UnknownRecord | null {
  return value === null || value === undefined ? null : record(value)
}

function array(value: unknown): UnknownRecord[] {
  return Array.isArray(value) ? value.map(record) : []
}

function string(value: unknown): string {
  return value === null || value === undefined ? '' : String(value)
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value)
}

function number(value: unknown): number {
  return typeof value === 'number' ? value : Number(value ?? 0)
}

function nullableNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : number(value)
}

function boolean(value: unknown): boolean {
  return value === true
}

function nullableBoolean(value: unknown): boolean | null {
  return value === null || value === undefined ? null : boolean(value)
}
