import { readFile } from 'node:fs/promises'
import { z } from 'zod'

import { datalab, isDatalabError } from '@/client'
import { ResumeSchema } from '@/examples/schema'

const PIPELINE_NAME = 'Resume Parser'
const JOB_TIMEOUT_MS = 60_000

async function getOrCreatePipeline(name: string) {
  const existing = (await datalab.pipelines.list()).pipelines.find(
    pipeline => pipeline.name === name
  )
  if (existing) return existing

  const draft = await datalab.pipelines.create({
    steps: [
      {
        type: 'convert',
        settings: { mode: 'fast', outputFormat: 'json' },
      },
      {
        type: 'extract',
        settings: {
          extractionMode: 'fast',
          pageSchema: ResumeSchema,
        },
      },
    ],
  })
  const saved = await datalab.pipelines.save(draft.pipelineId, {
    name,
  })
  const version = await datalab.pipelines.publish(saved.pipelineId, {
    description: 'Initial TypeScript resume extraction pipeline',
  })

  return { ...saved, activeVersion: version.version }
}

async function main() {
  const pipeline = await getOrCreatePipeline(PIPELINE_NAME)

  if (pipeline.activeVersion < 1) {
    throw new Error(
      `Pipeline ${pipeline.pipelineId} has no published version`
    )
  }

  const bytes = await readFile(new URL('./resume.pdf', import.meta.url))
  const file = new Blob([bytes], { type: 'application/pdf' })

  const resume = await datalab.pipelines.run(
    pipeline.pipelineId,
    { file, filename: 'resume.pdf' },
    {
      version: pipeline.activeVersion,
      intervalMs: 2_000,
      timeoutMs: JOB_TIMEOUT_MS,
      resultStepIndex: 1,
      pageSchema: ResumeSchema,
    }
  )

  console.dir(resume, { depth: null })
}

try {
  await main()
} catch (error) {
  if (isDatalabError(error)) {
    console.error('Datalab pipeline failed:')
    console.error(JSON.stringify(error.toJSON(), null, 2))
  } else if (error instanceof z.ZodError) {
    console.error('Datalab returned an invalid resume payload:')
    console.error(z.prettifyError(error))
  } else {
    console.error('Unexpected error:', error)
  }
  process.exitCode = 1
}
