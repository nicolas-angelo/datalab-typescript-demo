import { afterEach, describe, expect, test } from 'bun:test'

import { type ExtractionResult, unwrapDatalabResult } from '@/pkg'
import { createIntegrationClient, ResultTracker } from './test-utils'

const client = createIntegrationClient()
const results = new ResultTracker(client)
const fixture = Bun.file(
  new URL('../fixtures/sample.pdf', import.meta.url)
)

afterEach(async () => {
  await results.cleanup()
})

describe('Datalab live API', () => {
  test('converts a one-page PDF', async () => {
    const job = await client.submitConversion(
      { file: fixture, filename: 'sample.pdf' },
      { mode: 'fast', outputFormat: 'json' }
    )
    results.track(job.request_id)

    const result = await client.waitForResult(job.request_check_url, {
      intervalMs: 2_000,
      timeoutMs: 60_000,
    })

    expect(result).toMatchObject({ status: 'complete', success: true })
    expect(result.page_count).toBe(1)
    expect(result.json).toBeDefined()
  })

  test('extracts a short schema from a one-page PDF', async () => {
    const job = await client.submitExtraction(
      { file: fixture, filename: 'sample.pdf' },
      {
        extractionMode: 'fast',
        pageSchema: {
          type: 'object',
          properties: { name: { type: 'string' } },
          required: ['name'],
        },
      }
    )
    results.track(job.request_id)

    const result = await client.waitForResult<
      ExtractionResult<{ name: string }>
    >(job.request_check_url, {
      intervalMs: 2_000,
      timeoutMs: 60_000,
    })
    const extracted = unwrapDatalabResult(result) as { name: string }

    expect(result).toMatchObject({ status: 'complete', success: true })
    expect(extracted.name).toBeString()
    expect(extracted.name.length).toBeGreaterThan(0)
  })
})
