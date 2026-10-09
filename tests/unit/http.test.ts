import { describe, expect, mock, test } from 'bun:test'

import {
  DatalabAbortError,
  DatalabApiError,
  DatalabNetworkError,
  HttpClient,
} from '@/pkg'

function asFetch(
  implementation: (
    input: string | URL | Request,
    init?: RequestInit
  ) => Promise<Response>
) {
  return mock(implementation)
}

describe('HttpClient', () => {
  test('resolves URLs, authenticates API calls, and skips auth for signed URLs', async () => {
    const fetchMock = asFetch(async () => Response.json({ ok: true }))
    const client = new HttpClient({
      apiKey: 'secret',
      baseUrl: 'https://api.test/v1/',
      fetch: fetchMock as unknown as typeof fetch,
    })

    await client.request('/convert')
    await client.request('https://signed.test/result', {}, false)

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://api.test/v1/convert'
    )
    expect(
      new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get('X-API-Key')
    ).toBe('secret')
    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://signed.test/result')
    expect(
      new Headers(fetchMock.mock.calls[1]?.[1]?.headers).has('X-API-Key')
    ).toBe(false)
  })

  test('parses JSON, text, and empty responses', async () => {
    const responses = [
      Response.json({ value: 1 }),
      new Response('plain text'),
      new Response(null, { status: 204 }),
    ]
    const nextResponse = () => {
      const response = responses.shift()
      if (!response) throw new Error('No queued response')
      return response
    }
    const client = new HttpClient({
      apiKey: 'secret',
      fetch: asFetch(async () =>
        nextResponse()
      ) as unknown as typeof fetch,
    })

    expect(await client.request<{ value: number }>('/json')).toEqual({
      value: 1,
    })
    expect(await client.request<string>('/text')).toBe('plain text')
    expect(await client.request<void>('/empty')).toBeUndefined()
  })

  test('formats API validation errors', async () => {
    const client = new HttpClient({
      apiKey: 'secret',
      maxRetries: 0,
      fetch: asFetch(async () =>
        Response.json(
          {
            detail: [{ msg: 'file is required' }, { msg: 'invalid mode' }],
          },
          { status: 422 }
        )
      ) as unknown as typeof fetch,
    })

    const error = await client.request('/convert').catch(error => error)
    expect(error).toBeInstanceOf(DatalabApiError)
    if (!(error instanceof DatalabApiError)) throw error
    expect(error.message).toBe('file is required; invalid mode')
    expect(error.status).toBe(422)
  })

  test('retries only 429, 500, and 529 responses', async () => {
    for (const status of [429, 500, 529]) {
      let attempts = 0
      const client = new HttpClient({
        apiKey: 'secret',
        maxRetries: 1,
        fetch: asFetch(async () => {
          attempts++
          if (attempts === 1) {
            return Response.json(
              { detail: 'busy' },
              { status, headers: { 'retry-after': '0' } }
            )
          }
          return Response.json({ ok: true })
        }) as unknown as typeof fetch,
      })

      await expect(client.request('/health')).resolves.toEqual({
        ok: true,
      })
      expect(attempts).toBe(2)
    }

    let nonRetryableAttempts = 0
    const nonRetryable = new HttpClient({
      apiKey: 'secret',
      maxRetries: 2,
      fetch: asFetch(async () => {
        nonRetryableAttempts++
        return new Response('bad gateway', { status: 502 })
      }) as unknown as typeof fetch,
    })

    await expect(nonRetryable.request('/health')).rejects.toBeInstanceOf(
      DatalabApiError
    )
    expect(nonRetryableAttempts).toBe(1)
  })

  test('wraps network and abort failures', async () => {
    const networkClient = new HttpClient({
      apiKey: 'secret',
      fetch: asFetch(async () => {
        throw new Error('offline')
      }) as unknown as typeof fetch,
    })
    await expect(networkClient.request('/health')).rejects.toBeInstanceOf(
      DatalabNetworkError
    )

    const controller = new AbortController()
    controller.abort('stop')
    const abortClient = new HttpClient({
      apiKey: 'secret',
      fetch: asFetch(async (_input, init) => {
        throw init?.signal?.reason
      }) as unknown as typeof fetch,
    })
    await expect(
      abortClient.request('/health', { signal: controller.signal })
    ).rejects.toBeInstanceOf(DatalabAbortError)
  })
})
