import type { z } from 'zod'

import type { OutputFormat, PageSchema, PollOptions } from './types'

export type PipelineStepType =
  | 'convert'
  | 'extract'
  | 'segment'
  | 'custom'
  | 'fill'

export interface PipelineStep {
  type: PipelineStepType
  settings?: Record<string, unknown> & {
    pageSchema?: PageSchema
    segmentationSchema?: PageSchema
  }
  customProcessorId?: string | null
  evalRubricId?: number | null
}

export interface Pipeline {
  id: number
  pipelineId: string
  name: string | null
  steps: PipelineStep[]
  isSaved: boolean
  archived: boolean
  activeVersion: number
  created: string | null
  updated: string | null
  reused: boolean
}

export interface PipelineList {
  pipelines: Pipeline[]
  total: number
}

export interface PipelineVersion {
  id: number
  version: number
  steps: PipelineStep[]
  description: string | null
  created: string | null
}

export interface PipelineVersionList {
  versions: PipelineVersion[]
  total: number
}

export type PipelineExecutionStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'completed_with_errors'
  | 'failed'

export type PipelineStepStatus =
  | 'pending'
  | 'dispatched'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped'

export interface PipelineExecutionStep {
  stepIndex: number
  stepType: PipelineStepType | string
  status: PipelineStepStatus
  lookupKey: string | null
  resultUrl: string | null
  startedAt: string | null
  finishedAt: string | null
  errorMessage: string | null
  sourceStepType: string | null
  checkpointId: string | null
  checkpointReused: boolean | null
}

export interface PipelineExecution {
  executionId: string
  pipelineId: string
  pipelineVersion: number
  status: PipelineExecutionStatus
  steps: PipelineExecutionStep[]
  startedAt: string | null
  completedAt: string | null
  created: string | null
  configSnapshot: Record<string, unknown> | null
  inputConfig: Record<string, unknown> | null
  rateBreakdown: Record<string, unknown> | null
}

export interface PipelineExecutionList {
  executions: PipelineExecution[]
  total: number
}

export type PipelineRunSource =
  | Blob
  | { file: Blob; filename?: string }
  | { url: string }

export interface PipelineRunOptions {
  pageRange?: string
  outputFormat?: OutputFormat
  runEvals?: boolean
  runEvalsSteps?: PipelineStepType[]
  skipCache?: boolean
  checkpointId?: string
  webhookUrl?: string
  processingLocation?: string
  version?: number
}

export interface PipelineRunAndPollOptions
  extends PipelineRunOptions,
    PollOptions {}

export interface ZodPipelineRunOptions<T extends z.ZodObject>
  extends PipelineRunAndPollOptions {
  pageSchema: T
  /** Defaults to the final step in the execution. */
  resultStepIndex?: number
}

export interface PipelineListOptions {
  savedOnly?: boolean
  includeArchived?: boolean
  limit?: number
  offset?: number
}

export interface PipelineExecutionListOptions {
  limit?: number
  offset?: number
}
