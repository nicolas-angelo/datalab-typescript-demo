---
name: datalab-sdk-ts
description: Work with the @datalab/sdk TypeScript SDK for document conversion, structured extraction, Zod-validated output, and Datalab pipelines. Use when converting PDFs or documents, extracting typed data, managing asynchronous Datalab jobs, or creating and running document pipelines in TypeScript.
---

# Datalab TypeScript SDK

Use `@datalab/sdk` to convert documents and extract structured data without implementing Datalab's polling or result-download flow yourself.

## Installation

```bash
npm install @datalab/sdk zod
```

Set the API key in the server environment:

```bash
DATALAB_API_KEY=your-api-key
```

Keep this key in server-side code. Do not expose it in browser bundles.

## Quick Start

### Initialize the client

```ts
import { DatalabClient } from '@datalab/sdk'

const datalab = new DatalabClient({
  apiKey: process.env.DATALAB_API_KEY!,
})
```

### Convert a document

```ts
const result = await datalab.convert(
  { url: 'https://example.com/document.pdf' },
  { outputFormat: 'markdown', mode: 'fast' }
)

console.log(result.markdown)
```

### Extract typed data with Zod

```ts
import { z } from 'zod'

const InvoiceSchema = z.object({
  invoiceNumber: z.string(),
  total: z.number(),
})

const invoice = await datalab.extract(
  { url: 'https://example.com/invoice.pdf' },
  { pageSchema: InvoiceSchema, extractionMode: 'fast' }
)

// Inferred as { invoiceNumber: string; total: number }
console.log(invoice.total)
```

The SDK converts Zod schemas to JSON Schema for the API, validates the returned payload, and returns the inferred Zod output type.

## References

| Reference | Description |
| --- | --- |
| [references/document-processing.md](references/document-processing.md) | File sources, conversion, extraction, checkpoints, polling, cancellation, and errors |
| [references/pipelines.md](references/pipelines.md) | Creating, publishing, updating, and running document pipelines |

## Recommended Patterns

### Prefer high-level methods for ordinary jobs

```ts
const result = await datalab.convert(source, options, {
  timeoutMs: 60_000,
})
```

`convert` and `extract` submit the job, poll its status, follow signed result URLs, and return the completed output.

### Use submission methods for custom job control

```ts
const job = await datalab.submitConversion(source, options)
console.log(job.request_id)

const result = await datalab.waitForResult(job.request_check_url, {
  timeoutMs: 60_000,
})
```

Use submission methods when the application needs to persist a request ID, separate submission from polling, or coordinate work across processes.

### Pass Zod schemas directly for typed, validated output

```ts
const invoice = await datalab.extract(source, {
  pageSchema: InvoiceSchema,
})
```

Passing a Zod object lets the SDK convert the schema, validate the response, and return the inferred output directly.

### Use JSON Schema for the complete extraction response

```ts
const result = await datalab.extract<Invoice>(source, {
  pageSchema: invoiceJsonSchema,
})

console.log(result.extraction_schema_json?.total)
```

JSON Schema calls return the complete `ExtractionResult`, including extraction metadata and the parsed payload in `extraction_schema_json`.

## Quick API Reference

```ts
await datalab.convert(source, options, pollOptions)
await datalab.extract(source, options, pollOptions)

const job = await datalab.submitConversion(source, options)
await datalab.waitForResult(job.request_check_url, pollOptions)

const extraction = await datalab.submitExtraction(source, options)
await datalab.waitForResult(extraction.request_check_url, pollOptions)

await datalab.pipelines.list()
await datalab.pipelines.create({ steps })
await datalab.pipelines.run(pipelineId, source, options)
```

Use `isDatalabError(error)` to narrow SDK errors. Typed errors include API, network, timeout, abort, job, and pipeline failures.

## Best Practices

1. Store `DATALAB_API_KEY` in the server environment.
2. Use `Blob`, a URL, or a conversion checkpoint instead of manually constructing multipart requests.
3. Prefer Zod when the application needs validated, typed extraction output.
4. Set a polling timeout appropriate for the document size.
5. Use submission methods only when the application needs separate job control.
