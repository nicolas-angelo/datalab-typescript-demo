import { describe, expect, expectTypeOf, test } from 'bun:test'
import { z } from 'zod'

import {
  DatalabClient,
  DatalabPipelineError,
  type PipelineExecution,
} from '@/pkg'
import {
  formData,
  jsonBody,
  recordedRequest,
  TestRequester,
} from './test-requester'

const rawPipeline = {
  id: 1,
  pipeline_id: 'pl_1',
  name: 'Parser',
  steps: [],
  is_saved: true,
  archived: false,
  active_version: 1,
  created: '2026-01-01T00:00:00Z',
  updated: '2026-01-01T00:00:00Z',
  reused: false,
}

function execution(
  status:
    | 'pending'
    | 'running'
    | 'completed'
    | 'completed_with_errors'
    | 'failed',
  errorMessage: string | null = null
) {
  return {
    execution_id: 'exec_1',
    pipeline_id: 'pl_1',
    pipeline_version: 1,
    status,
    steps: [
      {
        step_index: 0,
        step_type: 'convert',
        status: status === 'failed' ? 'failed' : 'completed',
        error_message: errorMessage,
      },
      {
        step_index: 1,
        step_type: 'extract',
        status: status === 'completed' ? 'completed' : 'skipped',
        error_message: null,
      },
    ],
  }
}

describe('PipelineClient', () => {
  test('creates, updates, and publishes pipeline drafts', async () => {
    const schema = z.object({ title: z.string() })
    const requester = new TestRequester().enqueue(
      rawPipeline,
      rawPipeline,
      {
        id: 2,
        version: 2,
        steps: [],
        description: 'Version two',
        created: '2026-01-02T00:00:00Z',
      }
    )
    const pipelines = new DatalabClient(requester).pipelines
    const steps = [
      { type: 'convert' as const, settings: { mode: 'fast' } },
      { type: 'extract' as const, settings: { pageSchema: schema } },
    ]

    const created = await pipelines.create({ steps })
    await pipelines.update(created.pipelineId, { steps })
    const version = await pipelines.publish(created.pipelineId, {
      description: 'Version two',
    })

    expect(created).toMatchObject({ pipelineId: 'pl_1', activeVersion: 1 })
    const createBody = jsonBody(recordedRequest(requester.requests, 0))
    const wireSteps = createBody.steps as Array<Record<string, any>>
    expect(requester.requests[0]?.path).toBe('/pipelines')
    expect(wireSteps[0]?.settings.mode).toBe('fast')
    expect(
      JSON.parse(wireSteps[1]?.settings.page_schema).properties.title.type
    ).toBe('string')
    expect(requester.requests[1]).toMatchObject({
      path: '/pipelines/pl_1',
      init: { method: 'PUT' },
    })
    expect(version.version).toBe(2)
  })

  test('runs, polls, fetches the final step, and validates typed output', async () => {
    const schema = z.object({ title: z.string() })
    const requester = new TestRequester().enqueue(
      execution('pending'),
      execution('running'),
      execution('completed'),
      {
        extraction_schema_json: JSON.stringify({
          title: 'Hello',
          extra: true,
        }),
      }
    )
    const client = new DatalabClient(requester)

    const result = await client.pipelines.run(
      'pl_1',
      { url: 'https://files.test/document.pdf' },
      {
        pageSchema: schema,
        version: 1,
        intervalMs: 0,
        timeoutMs: 100,
      }
    )

    expect(result).toEqual({ title: 'Hello' })
    const runForm = formData(recordedRequest(requester.requests, 0))
    expect(runForm.get('file_url')).toBe('https://files.test/document.pdf')
    expect(runForm.get('version')).toBe('1')
    expect(requester.requests[3]?.path).toBe(
      '/pipelines/executions/exec_1/steps/1/result'
    )
  })

  test('returns partial executions and throws typed failures', async () => {
    const partialRequester = new TestRequester().enqueue(
      execution('pending'),
      execution('completed_with_errors')
    )
    const partial = await new DatalabClient(
      partialRequester
    ).pipelines.run(
      'pl_1',
      { url: 'https://files.test/document.pdf' },
      { intervalMs: 0, timeoutMs: 100 }
    )
    expect(partial.status).toBe('completed_with_errors')

    const failedRequester = new TestRequester().enqueue(
      execution('pending'),
      execution('failed', 'convert failed')
    )
    await expect(
      new DatalabClient(failedRequester).pipelines.run(
        'pl_1',
        { url: 'https://files.test/document.pdf' },
        { intervalMs: 0, timeoutMs: 100 }
      )
    ).rejects.toBeInstanceOf(DatalabPipelineError)
  })

  test('validates basic pipeline composition', async () => {
    const pipelines = new DatalabClient(new TestRequester()).pipelines
    await expect(pipelines.create({ steps: [] })).rejects.toThrow(
      'at least one step'
    )
    await expect(
      pipelines.create({
        steps: [
          { type: 'convert' },
          { type: 'extract' },
          { type: 'segment' },
        ],
      })
    ).rejects.toThrow('extract step must be last')
  })
})

function typeAssertions() {
  const pipelines = new DatalabClient(new TestRequester()).pipelines
  const typed = pipelines.run(
    'pl_1',
    { url: 'https://files.test/document.pdf' },
    { pageSchema: z.object({ title: z.string() }) }
  )
  expectTypeOf(typed).toEqualTypeOf<Promise<{ title: string }>>()

  const executionResult = pipelines.run('pl_1', {
    url: 'https://files.test/document.pdf',
  })
  expectTypeOf(executionResult).toEqualTypeOf<Promise<PipelineExecution>>()
}

void typeAssertions
