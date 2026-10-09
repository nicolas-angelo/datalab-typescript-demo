import { DatalabApiError, DatalabClient } from '@/pkg'

export function createIntegrationClient() {
  const apiKey = process.env.DATALAB_API_KEY
  if (!apiKey) {
    throw new Error(
      'DATALAB_API_KEY is required to run Datalab integration tests'
    )
  }
  return new DatalabClient({ apiKey })
}

export class ResultTracker {
  private readonly requestIds = new Set<string>()

  constructor(private readonly client: DatalabClient) {}

  track(requestId: string) {
    this.requestIds.add(requestId)
  }

  async cleanup() {
    const requestIds = [...this.requestIds]
    this.requestIds.clear()
    const results = await Promise.allSettled(
      requestIds.map(requestId => this.client.deleteResult(requestId))
    )
    const errors = results.flatMap(result => {
      if (result.status === 'fulfilled') return []
      if (
        result.reason instanceof DatalabApiError &&
        result.reason.status === 404
      ) {
        return []
      }
      return [result.reason]
    })
    if (errors.length > 0) {
      throw new AggregateError(
        errors,
        'Failed to clean up Datalab results'
      )
    }
  }
}
