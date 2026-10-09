import { describe, expect, expectTypeOf, test } from 'bun:test'
import { z } from 'zod'

import {
  DatalabClient,
  DatalabJobError,
  DatalabTimeoutError,
  type ExtractionResult,
} from '@/pkg'
import {
  formData,
  recordedRequest,
  type RecordedRequest,
  TestRequester,
} from './test-requester'

const submitted = {
  request_id: 'req_1',
  request_check_url: 'https://api.test/results/req_1',
  success: true,
}

describe('DatalabClient', () => {
  test('submits URL and file sources with snake-case options', async () => {
    const requester = new TestRequester().enqueue(submitted, submitted)
    const client = new DatalabClient(requester)

    await client.submitConversion(
      { url: 'https://files.test/document.pdf' },
      { outputFormat: 'json', maxPages: 2, saveCheckpoint: true }
    )
    await client.submitConversion({
      file: new Blob(['pdf'], { type: 'application/pdf' }),
      filename: 'document.pdf',
    })

    const urlForm = formData(recordedRequest(requester.requests, 0))
    expect(urlForm.get('file_url')).toBe('https://files.test/document.pdf')
    expect(urlForm.get('output_format')).toBe('json')
    expect(urlForm.get('max_pages')).toBe('2')
    expect(urlForm.get('save_checkpoint')).toBe('true')

    const file = formData(recordedRequest(requester.requests, 1)).get(
      'file'
    )
    expect(file).toBeInstanceOf(File)
    expect((file as File).name).toBe('document.pdf')
  })

  test('converts Zod pageSchema and returns validated inferred data', async () => {
    const schema = z.object({ name: z.string() })
    const requester = new TestRequester().enqueue(submitted, {
      status: 'complete',
      success: true,
      extraction_schema_json: JSON.stringify({
        name: 'Ada',
        ignored: true,
      }),
    })
    const client = new DatalabClient(requester)

    const result = await client.extract(
      { checkpointId: 'checkpoint_1' },
      { pageSchema: schema },
      { intervalMs: 0, timeoutMs: 100 }
    )

    expect(result).toEqual({ name: 'Ada' })
    const body = formData(recordedRequest(requester.requests, 0))
    const wireSchema = JSON.parse(String(body.get('page_schema')))
    expect(wireSchema.properties.name.type).toBe('string')
    expect(body.get('checkpoint_id')).toBe('checkpoint_1')
  })

  test('keeps the complete extraction result for JSON Schema input', async () => {
    const requester = new TestRequester().enqueue(submitted, {
      status: 'complete',
      success: true,
      extraction_schema_json: JSON.stringify({ title: 'Document' }),
    })
    const client = new DatalabClient(requester)

    const result = await client.extract(
      { checkpointId: 'checkpoint_1' },
      {
        pageSchema: {
          type: 'object',
          properties: { title: { type: 'string' } },
        },
      },
      { intervalMs: 0, timeoutMs: 100 }
    )

    expect(result.status).toBe('complete')
    expect(result.extraction_schema_json).toEqual({ title: 'Document' })
  })

  test('downloads signed results without auth and preserves polling metadata', async () => {
    const requester = new TestRequester().enqueue(
      submitted,
      {
        status: 'complete',
        success: true,
        result_url: 'https://signed.test/result.json',
        total_cost: 2,
      },
      { markdown: '# Document', total_cost: 1 }
    )
    const client = new DatalabClient(requester)

    const result = await client.convert(
      { url: 'https://files.test/document.pdf' },
      {},
      { intervalMs: 0, timeoutMs: 100 }
    )

    expect(result.markdown).toBe('# Document')
    expect(result.total_cost).toBe(2)
    expect(requester.requests[2]).toMatchObject({
      path: 'https://signed.test/result.json',
      authenticated: false,
    })
  })

  test('throws typed job and timeout errors', async () => {
    const failed = new DatalabClient(
      new TestRequester().enqueue(submitted, {
        status: 'failed',
        success: false,
        error: 'bad document',
      })
    )
    await expect(
      failed.convert(
        { url: 'https://files.test/bad.pdf' },
        {},
        { intervalMs: 0, timeoutMs: 100 }
      )
    ).rejects.toBeInstanceOf(DatalabJobError)

    const pending = new TestRequester().enqueue(
      ({ init }: RecordedRequest) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener(
            'abort',
            () => reject(init.signal?.reason),
            { once: true }
          )
        })
    )
    await expect(
      new DatalabClient(pending).waitForResult(
        'https://api.test/pending',
        {
          timeoutMs: 5,
        }
      )
    ).rejects.toBeInstanceOf(DatalabTimeoutError)
  })

  test('deletes stored results', async () => {
    const requester = new TestRequester().enqueue({})
    await new DatalabClient(requester).deleteResult('req/1')
    expect(requester.requests[0]).toMatchObject({
      path: '/results/req%2F1',
      init: { method: 'DELETE' },
    })
  })

  test('accepts a structural requester object', async () => {
    const requests: string[] = []
    const client = new DatalabClient({
      async request<T>(path: string) {
        requests.push(path)
        return submitted as T
      },
    })

    await client.submitConversion({
      url: 'https://files.test/document.pdf',
    })
    expect(requests).toEqual(['/convert'])
  })
})

function typeAssertions() {
  const client = new DatalabClient(new TestRequester())
  const zodResult = client.extract(
    { checkpointId: 'checkpoint' },
    { pageSchema: z.object({ name: z.string() }) }
  )
  expectTypeOf(zodResult).toEqualTypeOf<Promise<{ name: string }>>()

  const jsonResult = client.extract(
    { checkpointId: 'checkpoint' },
    { pageSchema: { type: 'object' } }
  )
  expectTypeOf(jsonResult).toEqualTypeOf<
    Promise<ExtractionResult<unknown>>
  >()
}

void typeAssertions
