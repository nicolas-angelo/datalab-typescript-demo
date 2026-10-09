import {
  DatalabAbortError,
  DatalabApiError,
  DatalabNetworkError,
  isDatalabError,
} from './errors'

const DEFAULT_BASE_URL = 'https://www.datalab.to/api/v1'
const RETRYABLE_STATUSES = new Set([429, 500, 529])

export interface Requester {
  request<T>(
    pathOrUrl: string,
    init?: RequestInit,
    authenticated?: boolean
  ): Promise<T>
}

export interface HttpClientOptions {
  apiKey: string
  baseUrl?: string
  fetch?: typeof globalThis.fetch
  /** Retry count for 429, 500, and 529 responses. Defaults to 3. */
  maxRetries?: number
}

export class HttpClient implements Requester {
  private readonly apiKey: string
  private readonly baseUrl: string
  private readonly fetch: typeof globalThis.fetch
  private readonly maxRetries: number

  constructor(options: HttpClientOptions) {
    if (!options.apiKey) throw new Error('A Datalab API key is required')
    this.apiKey = options.apiKey
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '')
    this.fetch = options.fetch ?? globalThis.fetch
    this.maxRetries = options.maxRetries ?? 3
  }

  async request<T>(
    pathOrUrl: string,
    init: RequestInit = {},
    authenticated = true
  ): Promise<T> {
    const url = /^https?:\/\//.test(pathOrUrl)
      ? pathOrUrl
      : `${this.baseUrl}${pathOrUrl}`

    for (let attempt = 0; ; attempt++) {
      const headers = new Headers(init.headers)
      if (authenticated) headers.set('X-API-Key', this.apiKey)

      let response: Response
      try {
        response = await this.fetch(url, { ...init, headers })
      } catch (error) {
        if (init.signal?.aborted) {
          if (isDatalabError(init.signal.reason)) {
            throw init.signal.reason
          }
          throw new DatalabAbortError(undefined, init.signal.reason)
        }
        throw new DatalabNetworkError(undefined, error)
      }
      const body = await parseBody(response)

      if (response.ok) return body as T

      if (
        attempt < this.maxRetries &&
        RETRYABLE_STATUSES.has(response.status)
      ) {
        await delay(retryDelay(response, attempt), init.signal)
        continue
      }

      throw new DatalabApiError(
        errorMessage(body, response.status),
        response.status,
        body
      )
    }
  }
}

async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return undefined
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function errorMessage(body: unknown, status: number): string {
  if (typeof body === 'string') return body
  if (body && typeof body === 'object' && 'detail' in body) {
    const detail = (body as { detail: unknown }).detail
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail)) {
      return detail
        .map(item =>
          item && typeof item === 'object' && 'msg' in item
            ? String(item.msg)
            : JSON.stringify(item)
        )
        .join('; ')
    }
  }
  return `Datalab API request failed with HTTP ${status}`
}

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get('retry-after')
  if (retryAfter) {
    const seconds = Number(retryAfter)
    if (Number.isFinite(seconds)) return seconds * 1_000
  }
  return Math.min(1_000 * 2 ** attempt, 10_000)
}

export function delay(ms: number, signal?: AbortSignal | null) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason)
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        reject(signal.reason)
      },
      { once: true }
    )
  })
}
