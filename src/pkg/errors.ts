export type DatalabErrorCode =
  | 'api_error'
  | 'job_failed'
  | 'timeout'
  | 'aborted'
  | 'network_error'
  | 'pipeline_failed'

export class DatalabError extends Error {
  readonly code: DatalabErrorCode

  constructor(
    message: string,
    code: DatalabErrorCode,
    options?: ErrorOptions
  ) {
    super(message, options)
    this.name = 'DatalabError'
    this.code = code
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
    }
  }
}

export class DatalabApiError extends DatalabError {
  readonly status: number
  readonly body: unknown

  constructor(message: string, status: number, body: unknown) {
    super(message, 'api_error')
    this.name = 'DatalabApiError'
    this.status = status
    this.body = body
  }

  override toJSON() {
    return { ...super.toJSON(), status: this.status, body: this.body }
  }
}

export class DatalabJobError extends DatalabError {
  readonly result: Record<string, unknown>

  constructor(message: string, result: Record<string, unknown>) {
    super(message, 'job_failed')
    this.name = 'DatalabJobError'
    this.result = result
  }

  override toJSON() {
    return { ...super.toJSON(), result: this.result }
  }
}

export class DatalabTimeoutError extends DatalabError {
  readonly timeoutMs: number

  constructor(timeoutMs: number) {
    const duration =
      timeoutMs >= 1_000
        ? `${Math.round(timeoutMs / 1_000)} seconds`
        : `${timeoutMs} ms`
    super(`Datalab job did not complete within ${duration}`, 'timeout')
    this.name = 'DatalabTimeoutError'
    this.timeoutMs = timeoutMs
  }

  override toJSON() {
    return { ...super.toJSON(), timeoutMs: this.timeoutMs }
  }
}

export class DatalabAbortError extends DatalabError {
  constructor(message = 'Datalab request was aborted', cause?: unknown) {
    super(message, 'aborted', { cause })
    this.name = 'DatalabAbortError'
  }
}

export class DatalabNetworkError extends DatalabError {
  constructor(
    message = 'Unable to reach the Datalab API',
    cause?: unknown
  ) {
    super(message, 'network_error', { cause })
    this.name = 'DatalabNetworkError'
  }
}

export class DatalabPipelineError extends DatalabError {
  readonly execution: Record<string, unknown>

  constructor(message: string, execution: Record<string, unknown>) {
    super(message, 'pipeline_failed')
    this.name = 'DatalabPipelineError'
    this.execution = execution
  }

  override toJSON() {
    return { ...super.toJSON(), execution: this.execution }
  }
}

export function isDatalabError(error: unknown): error is DatalabError {
  return error instanceof DatalabError
}

/** Alternate capitalization for consumers that spell the brand DataLab. */
export const isDataLabError = isDatalabError

export function assertDatalabError(
  error: unknown
): asserts error is DatalabError {
  if (!isDatalabError(error)) {
    throw new TypeError('Expected a DatalabError', { cause: error })
  }
}

/** Alternate capitalization for consumers that spell the brand DataLab. */
export const assertDataLabError = assertDatalabError
