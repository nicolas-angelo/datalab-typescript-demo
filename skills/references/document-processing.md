# Document Processing

Use the high-level methods for ordinary conversion and extraction. They submit the request, poll until completion, download signed regional results when present, and normalize the response.

## Document Sources

### Blob

```ts
const result = await datalab.convert(Bun.file('./document.pdf'), {
  outputFormat: 'markdown',
})
```

### File with an explicit filename

```ts
const result = await datalab.convert(
  {
    file: Bun.file('./document.pdf'),
    filename: 'document.pdf',
  },
  { outputFormat: ['markdown', 'json'] }
)
```

### Remote URL

```ts
const result = await datalab.convert(
  { url: 'https://example.com/document.pdf' },
  { outputFormat: 'json' }
)
```

### Conversion checkpoint

A saved conversion checkpoint can be reused as an extraction source:

```ts
const converted = await datalab.convert(
  { url: 'https://example.com/invoice.pdf' },
  { outputFormat: 'json', saveCheckpoint: true }
)

if (!converted.checkpoint_id) {
  throw new Error('Conversion did not return a checkpoint')
}

const extracted = await datalab.extract(
  { checkpointId: converted.checkpoint_id },
  { pageSchema: InvoiceSchema }
)
```

Checkpoint sources are supported by extraction. Pipeline input uses a file or URL; pass an existing checkpoint through the pipeline run options when needed.

## Structured Extraction

Provide exactly one of `pageSchema` or `schemaId`. A `schemaVersion` is valid only with `schemaId`.

### JSON Schema

JSON Schema returns the complete Datalab result. The extracted object is available in `extraction_schema_json`.

```ts
import type { JsonSchema } from '@datalab/sdk'

type Invoice = {
  invoiceNumber: string
  total: number
}

const pageSchema = {
  type: 'object',
  properties: {
    invoiceNumber: { type: 'string' },
    total: { type: 'number' },
  },
  required: ['invoiceNumber', 'total'],
} satisfies JsonSchema

const result = await datalab.extract<Invoice>(
  { url: 'https://example.com/invoice.pdf' },
  { pageSchema, extractionMode: 'balanced' }
)

const invoice = result.extraction_schema_json
```

The generic describes the expected extraction payload; JSON Schema responses are not runtime-validated by the SDK.

### Zod Schema

A Zod object returns its validated output directly. Unknown object keys follow the behavior configured on the Zod schema.

```ts
import { z } from 'zod'

const InvoiceSchema = z.object({
  invoiceNumber: z.string(),
  total: z.number().nonnegative(),
})

type Invoice = z.output<typeof InvoiceSchema>

const invoice: Invoice = await datalab.extract(
  { url: 'https://example.com/invoice.pdf' },
  { pageSchema: InvoiceSchema, extractionMode: 'balanced' }
)
```

## Polling and Cancellation

`convert` and `extract` accept polling options as their third argument:

```ts
const controller = new AbortController()
process.once('SIGINT', () => controller.abort())

const result = await datalab.convert(source, options, {
  intervalMs: 1_000,
  timeoutMs: 60_000,
  signal: controller.signal,
})
```

Use the submission methods when a request ID or separate polling control is required:

```ts
const job = await datalab.submitExtraction(source, {
  pageSchema: InvoiceSchema,
})

console.log(job.request_id)

const result = await datalab.waitForResult(job.request_check_url, {
  timeoutMs: 60_000,
})
```

## Error Handling

```ts
import {
  DatalabTimeoutError,
  isDatalabError,
} from '@datalab/sdk'
import { z } from 'zod'

try {
  const invoice = await datalab.extract(source, {
    pageSchema: InvoiceSchema,
  })
  console.log(invoice)
} catch (error) {
  if (error instanceof DatalabTimeoutError) {
    console.error(`Timed out after ${error.timeoutMs} ms`)
  } else if (isDatalabError(error)) {
    console.error(error.code, error.message)
  } else if (error instanceof z.ZodError) {
    console.error(z.prettifyError(error))
  } else {
    throw error
  }
}
```

The SDK uses camelCase options such as `outputFormat`, `pageSchema`, and `saveCheckpoint`. It converts them to Datalab's snake_case multipart fields automatically.
