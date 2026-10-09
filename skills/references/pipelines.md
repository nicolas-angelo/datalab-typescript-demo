# Pipelines

A pipeline is created as a draft, saved with a name, published as a version, and then run against a file or URL.

## Create, Publish, and Run

```ts
import { DatalabClient } from '@datalab/sdk'
import { z } from 'zod'

const datalab = new DatalabClient({
  apiKey: process.env.DATALAB_API_KEY!,
})

const InvoiceSchema = z.object({
  invoiceNumber: z.string(),
  total: z.number(),
})

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
        pageSchema: InvoiceSchema,
      },
    },
  ],
})

const saved = await datalab.pipelines.save(draft.pipelineId, {
  name: 'Invoice Parser',
})

const published = await datalab.pipelines.publish(saved.pipelineId, {
  description: 'Initial invoice extraction pipeline',
})

const invoice = await datalab.pipelines.run(
  saved.pipelineId,
  { url: 'https://example.com/invoice.pdf' },
  {
    version: published.version,
    pageSchema: InvoiceSchema,
    resultStepIndex: 1,
    timeoutMs: 60_000,
  }
)

// Inferred as { invoiceNumber: string; total: number }
console.log(invoice.total)
```

Zod schemas in step settings are converted to JSON Schema before the pipeline is sent to Datalab. The `pageSchema` passed to `run` validates the selected step result and determines the returned TypeScript type.

## Drafts and Versions

- `create` creates a draft pipeline.
- `update` replaces the draft steps.
- `save` assigns a reusable name.
- `publish` creates a runnable version.
- `discardDraft` restores the draft from a published version.

Pass `version` when a run must use a specific published version. Without a `pageSchema` in the run options, `run` returns the completed `PipelineExecution` instead of a parsed step result.

## Result Step Selection

When `pageSchema` is present, the SDK fetches and validates one step result. `resultStepIndex` defaults to the final execution step.

```ts
const data = await datalab.pipelines.run(pipelineId, source, {
  pageSchema: ResultSchema,
  resultStepIndex: 1,
  timeoutMs: 60_000,
})
```

Set `resultStepIndex` explicitly when the desired output is not the final pipeline step.

## Manage Pipelines

```ts
const { pipelines } = await datalab.pipelines.list({
  savedOnly: true,
  includeArchived: false,
})

const pipeline = await datalab.pipelines.get(pipelineId)
const versions = await datalab.pipelines.listVersions(pipelineId)
const executions = await datalab.pipelines.listExecutions(pipelineId)

await datalab.pipelines.update(pipelineId, { steps })
await datalab.pipelines.archive(pipelineId)
await datalab.pipelines.unarchive(pipelineId)
```

## Lower-Level Execution Control

Use `submit` and `waitForExecution` when the application needs the execution ID before completion:

```ts
const execution = await datalab.pipelines.submit(pipelineId, source, {
  version: published.version,
})

console.log(execution.executionId)

const completed = await datalab.pipelines.waitForExecution(
  execution.executionId,
  { timeoutMs: 60_000 }
)
```

Failed executions throw `DatalabPipelineError`. An execution with `completed_with_errors` is returned so the application can inspect individual step statuses.

## Best Practices

1. Publish a version before running a pipeline in repeatable workflows.
2. Pass a version explicitly when reproducibility matters.
3. Use the same Zod schema for the extraction step and typed run result.
4. Choose `resultStepIndex` explicitly for pipelines with downstream steps.
5. Use `list` before creating named demo pipelines to avoid duplicates.
