export type ParseMode = 'fast' | 'balanced' | 'accurate'
export type ExtractionMode = 'turbo' | ParseMode
export type OutputFormat = 'markdown' | 'html' | 'json' | 'chunks'
export type ProcessingLocation = 'us' | 'eu' | (string & {})

export type JsonSchema = Record<string, unknown>
export type PageSchema = JsonSchema | z.ZodObject

export type DocumentSource =
  | Blob
  | { file: Blob; filename?: string }
  | { url: string }

export type ExtractionSource = DocumentSource | { checkpointId: string }

export interface ConvertOptions {
  mode?: ParseMode
  outputFormat?: OutputFormat | OutputFormat[]
  maxPages?: number
  pageRange?: string
  mergeCrossPage?: boolean
  paginate?: boolean
  addBlockIds?: boolean
  disableHtmlPrettify?: boolean
  includeMarkdownInChunks?: boolean
  disableImageExtraction?: boolean
  disableImageCaptions?: boolean
  wordBboxes?: boolean
  fenceSyntheticCaptions?: boolean
  tokenEfficientMarkdown?: boolean
  skipCache?: boolean
  saveCheckpoint?: boolean
  additionalConfig?: Record<string, unknown>
  extras?: string | string[]
  webhookUrl?: string
  processingLocation?: ProcessingLocation
  evalRubricId?: number
  modelOverrideSettings?: Record<string, unknown>
}

interface ExtractSchemaOptions {
  /** Inline JSON Schema. Mutually exclusive with schemaId. */
  pageSchema?: PageSchema
  /** ID of a schema saved in Datalab. Mutually exclusive with pageSchema. */
  schemaId?: string
  /** Only valid with schemaId. */
  schemaVersion?: number
}

export interface ExtractOptions extends ExtractSchemaOptions {
  extractionMode?: ExtractionMode
  mode?: ParseMode
  outputFormat?: OutputFormat | OutputFormat[]
  maxPages?: number
  pageRange?: string
  saveCheckpoint?: boolean
  skipCache?: boolean
  webhookUrl?: string
  processingLocation?: ProcessingLocation
  modelOverrideSettings?: Record<string, unknown>
}

export type ZodExtractOptions<T extends z.ZodObject> = Omit<
  ExtractOptions,
  'pageSchema'
> & { pageSchema: T }

export interface PollOptions {
  /** Delay between status checks. Defaults to 2 seconds. */
  intervalMs?: number
  /** Total polling deadline. Defaults to 10 minutes. */
  timeoutMs?: number
  signal?: AbortSignal
}

export interface SubmitResponse {
  request_id: string
  request_check_url: string
  success: boolean
  error?: string | null
  versions?: Record<string, unknown>
  checkpoint_reused?: boolean | null
}

export type JobStatus =
  | 'pending'
  | 'processing'
  | 'complete'
  | 'failed'
  | (string & {})

export interface CostBreakdown {
  [key: string]: unknown
}

export interface ConversionResult {
  status: JobStatus
  success: boolean
  error?: string | null
  result_url?: string | null
  expires_in?: number | null
  output_format?: string | null
  markdown?: string | null
  html?: string | null
  json?: unknown
  chunks?: unknown[] | null
  images?: Record<string, string> | null
  metadata?: Record<string, unknown> | null
  parse_quality_score?: number | null
  page_count?: number | null
  total_cost?: number | null
  cost_breakdown?: CostBreakdown | null
  runtime?: number | null
  checkpoint_id?: string | null
  versions?: Record<string, unknown> | null
  evaluation?: unknown
  [key: string]: unknown
}

export interface ExtractionResult<T = unknown> extends ConversionResult {
  /** Parsed from extraction_schema_json when the API returns a string. */
  extraction_schema_json?: T | null
  extraction_score_average?: number | null
  extraction_mode?: ExtractionMode | null
}

export interface DatalabClientOptions {
  apiKey: string
  baseUrl?: string
  fetch?: typeof globalThis.fetch
  /** Retry count for 429, 500, and 529 responses. Defaults to 3. */
  maxRetries?: number
}
import type { z } from 'zod'
