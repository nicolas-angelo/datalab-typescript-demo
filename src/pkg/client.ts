import {
  DatalabAbortError,
  DatalabJobError,
  DatalabTimeoutError,
  isDatalabError,
} from './errors'
import { delay, HttpClient, type Requester } from './http'
import { PipelineClient } from './pipelines'
import type {
  ConversionResult,
  ConvertOptions,
  DatalabClientOptions,
  DocumentSource,
  ExtractionResult,
  ExtractionSource,
  ExtractOptions,
  PollOptions,
  SubmitResponse,
  ZodExtractOptions,
} from './types'
import type { z } from 'zod'
import { isZodPageSchema, toJsonSchema } from './utils'

export class DatalabClient {
  private readonly requester: Requester
  readonly pipelines: PipelineClient

  constructor(options: DatalabClientOptions | Requester) {
    this.requester = isRequester(options)
      ? options
      : new HttpClient(options)
    this.pipelines = new PipelineClient(this.requester)
  }

  /** Submit a conversion without waiting for it to finish. */
  submitConversion(
    source: DocumentSource,
    options: ConvertOptions = {},
    signal?: AbortSignal
  ): Promise<SubmitResponse> {
    return this.submit('/convert', source, options, signal)
  }

  /** Convert a document and wait for its output. */
  async convert(
    source: DocumentSource,
    options: ConvertOptions = {},
    poll: PollOptions = {}
  ): Promise<ConversionResult> {
    const job = await this.submitConversion(source, options, poll.signal)
    return this.waitForResult<ConversionResult>(
      job.request_check_url,
      poll
    )
  }

  /** Submit structured extraction without waiting for it to finish. */
  submitExtraction(
    source: ExtractionSource,
    options: ExtractOptions,
    signal?: AbortSignal
  ): Promise<SubmitResponse> {
    validateExtraction(options)
    return this.submit(
      '/extract',
      source,
      { ...options, pageSchema: toJsonSchema(options.pageSchema) },
      signal
    )
  }

  /** Extract, validate, and return structured data directly. */
  extract<T extends z.ZodObject>(
    source: ExtractionSource,
    options: ZodExtractOptions<T>,
    poll?: PollOptions
  ): Promise<z.output<T>>
  /** Extract structured data and return the complete Datalab result. */
  extract<T = unknown>(
    source: ExtractionSource,
    options: ExtractOptions,
    poll?: PollOptions
  ): Promise<ExtractionResult<T>>
  async extract<T = unknown>(
    source: ExtractionSource,
    options: ExtractOptions,
    poll: PollOptions = {}
  ): Promise<ExtractionResult<T> | unknown> {
    const zodSchema = isZodPageSchema(options.pageSchema)
      ? options.pageSchema
      : undefined
    const job = await this.submitExtraction(source, options, poll.signal)
    const result = await this.waitForResult<ExtractionResult<T>>(
      job.request_check_url,
      poll
    )
    result.extraction_schema_json = parseExtraction<T>(
      result.extraction_schema_json
    )
    if (zodSchema) {
      return zodSchema.parse(result.extraction_schema_json)
    }
    return result
  }

  /** Poll any Datalab request_check_url until it completes. */
  async waitForResult<T extends ConversionResult>(
    requestCheckUrl: string,
    options: PollOptions = {}
  ): Promise<T> {
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
        const result = await this.requester.request<T>(requestCheckUrl, {
          signal,
        })

        if (result.status === 'complete' || result.status === 'failed') {
          if (!result.success || result.status === 'failed') {
            throw new DatalabJobError(
              result.error || 'Datalab job failed',
              result
            )
          }
          return this.downloadResult(result, signal)
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

  private async submit(
    path: string,
    source: ExtractionSource,
    options: ConvertOptions | ExtractOptions,
    signal?: AbortSignal
  ): Promise<SubmitResponse> {
    const form = new FormData()
    appendSource(form, source)
    appendOptions(form, options)
    const response = await this.requester.request<SubmitResponse>(path, {
      method: 'POST',
      body: form,
      signal,
    })
    if (!response.success) {
      throw new DatalabJobError(
        response.error || 'Datalab rejected the job',
        response as unknown as Record<string, unknown>
      )
    }
    return response
  }

  private async downloadResult<T extends ConversionResult>(
    polled: T,
    signal?: AbortSignal
  ): Promise<T> {
    if (!polled.result_url) return polled
    const downloaded = await this.requester.request<
      Record<string, unknown>
    >(polled.result_url, { signal }, false)
    return mergeNonNull(downloaded, polled) as T
  }

  async deleteResult(
    requestId: string,
    signal?: AbortSignal
  ): Promise<void> {
    await this.requester.request(
      `/results/${encodeURIComponent(requestId)}`,
      { method: 'DELETE', signal }
    )
  }
}

function isRequester(value: unknown): value is Requester {
  return (
    !!value &&
    typeof value === 'object' &&
    'request' in value &&
    typeof value.request === 'function'
  )
}

function appendSource(form: FormData, source: ExtractionSource) {
  if (source instanceof Blob) {
    form.append('file', source)
  } else if ('file' in source) {
    if (source.filename) form.append('file', source.file, source.filename)
    else form.append('file', source.file)
  } else if ('url' in source) {
    form.append('file_url', source.url)
  } else {
    form.append('checkpoint_id', source.checkpointId)
  }
}

function appendOptions(form: FormData, options: object) {
  for (const [key, value] of Object.entries(
    options as Record<string, unknown>
  )) {
    if (value === undefined) continue
    const field = key.replace(
      /[A-Z]/g,
      letter => `_${letter.toLowerCase()}`
    )
    if (Array.isArray(value)) form.append(field, value.join(','))
    else if (typeof value === 'object') {
      form.append(field, JSON.stringify(value))
    } else form.append(field, String(value))
  }
}

function validateExtraction(options: ExtractOptions) {
  if (!!options.pageSchema === !!options.schemaId) {
    throw new Error('Provide exactly one of pageSchema or schemaId')
  }
  if (options.schemaVersion !== undefined && !options.schemaId) {
    throw new Error('schemaVersion requires schemaId')
  }
}

function parseExtraction<T>(value: unknown): T | null | undefined {
  if (typeof value !== 'string') return value as T | null | undefined
  try {
    return JSON.parse(value) as T
  } catch {
    return value as T
  }
}

function mergeNonNull(
  downloaded: Record<string, unknown>,
  polled: Record<string, unknown>
) {
  const merged = { ...downloaded }
  for (const [key, value] of Object.entries(polled)) {
    if (value !== null && value !== undefined) merged[key] = value
  }
  return merged
}
