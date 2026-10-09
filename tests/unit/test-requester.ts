import type { Requester } from '@/pkg'

export interface RecordedRequest {
  path: string
  init: RequestInit
  authenticated: boolean
}

type Reply =
  | unknown
  | Error
  | ((request: RecordedRequest) => unknown | Promise<unknown>)

export class TestRequester implements Requester {
  readonly requests: RecordedRequest[] = []
  private readonly replies: Reply[] = []

  enqueue(...replies: Reply[]) {
    this.replies.push(...replies)
    return this
  }

  async request<T>(
    path: string,
    init: RequestInit = {},
    authenticated = true
  ): Promise<T> {
    const request = { path, init, authenticated }
    this.requests.push(request)
    const reply = this.replies.shift()
    if (reply === undefined) {
      throw new Error(`No queued response for ${path}`)
    }
    if (reply instanceof Error) throw reply
    return (
      typeof reply === 'function' ? await reply(request) : reply
    ) as T
  }
}

export function formData(request: RecordedRequest): FormData {
  if (!(request.init.body instanceof FormData)) {
    throw new TypeError('Expected request body to be FormData')
  }
  return request.init.body
}

export function recordedRequest(
  requests: RecordedRequest[],
  index: number
): RecordedRequest {
  const request = requests[index]
  if (!request) throw new Error(`No recorded request at index ${index}`)
  return request
}

export function jsonBody(
  request: RecordedRequest
): Record<string, unknown> {
  if (typeof request.init.body !== 'string') {
    throw new TypeError('Expected request body to be JSON')
  }
  return JSON.parse(request.init.body) as Record<string, unknown>
}
