import { DatalabClient } from '@/pkg'
export { isDatalabError } from '@/pkg'

const JOB_TIMEOUT_MS = 45_000

const API_KEY = process.env.DATALAB_API_KEY ?? ''

if (!API_KEY) {
  throw new Error('DATALAB_API_KEY is not set')
}

export const datalab = new DatalabClient({ apiKey: API_KEY })
export const pollOptions = { intervalMs: 2_000, timeoutMs: JOB_TIMEOUT_MS }
