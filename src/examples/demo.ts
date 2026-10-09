import { datalab, isDatalabError, pollOptions } from '@/client'
import { fileToBlob, fileNameFromPath } from '@/utils/fs'
import { ResumeSchema } from '@/examples/schema'
import { z } from 'zod'

async function convert(filePath: string) {
  const file = await fileToBlob(filePath)

  const convertOptions = {
    outputFormat: 'json',
    mode: 'fast',
    saveCheckpoint: true,
  } as const

  const result = await datalab.convert(
    {
      file,
      filename: fileNameFromPath(filePath),
    },
    convertOptions,
    pollOptions
  )

  return result
}

async function extract(checkpointId: string) {
  const extractOptions = {
    extractionMode: 'fast',
    pageSchema: ResumeSchema,
  } as const
  return datalab.extract({ checkpointId }, extractOptions, pollOptions)
}

async function main() {
  const conversion = await convert('./resume.pdf')

  if (!conversion.checkpoint_id) {
    throw new Error('Conversion did not return a checkpoint ID')
  }

  const resume = await extract(conversion.checkpoint_id)
  console.dir(resume, { depth: null })
}

try {
  await main()
} catch (error) {
  if (isDatalabError(error)) {
    console.error('Datalab request failed:')
    console.error(JSON.stringify(error.toJSON(), null, 2))
  } else if (error instanceof z.ZodError) {
    console.error('Datalab returned an invalid resume payload:')
    console.error(z.prettifyError(error))
  } else {
    console.error('Unexpected error:', error)
  }
  process.exitCode = 1
}
