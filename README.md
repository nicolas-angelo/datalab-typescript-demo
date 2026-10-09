# Datalab TypeScript SDK

An experimental TypeScript SDK for Datalab's asynchronous document conversion,
structured extraction, and pipeline APIs.

> This repository is a proof of concept. The package is not yet at feature
> parity with the official Python SDK.

## Agent Skills

This repository includes the `datalab-typescript-sdk` skill for agents working
with document conversion, structured extraction, Zod schemas, and pipelines.

Install it from the published GitHub repository with the
[skills.sh CLI](https://www.skills.sh/docs/cli):

```bash
bunx --bun skills add nicolas-angelo/datalab-typescript-demo --skill datalab-typescript-sdk
```

From a local checkout, install it directly instead:

```bash
bunx --bun skills add ./skills
```

The skill includes these references and loads them only when relevant:

- [Skill entrypoint](skills/SKILL.md): installation, quick examples, API
  overview, and recommended patterns.
- [Document processing](skills/references/document-processing.md): sources,
  conversion, extraction, checkpoints, polling, cancellation, and errors.
- [Pipelines](skills/references/pipelines.md): creating, publishing, updating,
  and running document pipelines.
- [Datalab documentation](https://documentation.datalab.to/): official API and
  product documentation.
- [Python SDK](https://github.com/datalab-to/sdk): reference implementation used
  for parity tracking.

## Quick Start

Install the SDK and Zod:

```bash
bun add @datalab/sdk
```

Set a server-side API key:

```bash
export DATALAB_API_KEY=your-api-key
```

Create a client and convert a document:

```ts
import { DatalabClient } from '@datalab/sdk'

const datalab = new DatalabClient({
  apiKey: process.env.DATALAB_API_KEY!,
})

const result = await datalab.convert(
  { url: 'https://example.com/document.pdf' },
  { outputFormat: 'markdown', mode: 'fast' },
  { timeoutMs: 60_000 }
)

console.log(result.markdown)
```

Pass a Zod object to extract validated, inferred data directly:

```ts
import { z } from 'zod'

const InvoiceSchema = z.object({
  invoiceNumber: z.string(),
  total: z.number(),
})

const invoice = await datalab.extract(
  { url: 'https://example.com/invoice.pdf' },
  { pageSchema: InvoiceSchema, extractionMode: 'balanced' },
  { timeoutMs: 60_000 }
)

// Inferred as { invoiceNumber: string; total: number }
console.log(invoice.total)
```

File uploads accept any `Blob`, including `Bun.file(...)`:

```ts
const result = await datalab.convert(
  { file: Bun.file('./document.pdf'), filename: 'document.pdf' },
  { outputFormat: ['markdown', 'json'] }
)
```

`convert` and `extract` submit, poll, follow signed result URLs, and return the
completed output. Use `submitConversion`, `submitExtraction`, and
`waitForResult` when an application needs separate job control.

## TODO: Python SDK Parity

The TypeScript proof of concept currently covers conversion, extraction,
pipeline lifecycle and execution, typed errors, polling, retries, and cancellation. The remaining parity work is:

### Document APIs

- [ ] Add document segmentation.
- [ ] Add custom processor execution.
- [ ] Add tracked-changes extraction for DOCX files.
- [ ] Add Markdown-to-DOCX document creation.
- [ ] Add PDF and image form filling.

### Managed Resources

- [ ] Add uploaded-file APIs: concurrent upload, list, metadata, download URL,
      and delete.
- [ ] Add extraction-schema create, list, get, update/version, and archive
      operations.
- [ ] Add custom-processor list, status, version selection, and archive
      operations.
- [ ] Add pipeline rate lookup.
- [ ] Add workflow step discovery, CRUD, execution polling, and result download,
      or document pipelines as the intentional replacement.

### Large Results and Local Files

- [ ] Support streaming large JSON responses without buffering the complete
      payload in memory.
- [ ] Add Node/Bun helpers for file paths, MIME detection, saving result files,
      and extracting bundled images.
- [ ] Add batch and directory processing with bounded concurrency.

### Client Experience

- [ ] Add environment-based initialization while keeping explicit credentials
      available for edge runtimes.
- [ ] Align retry behavior with the Python SDK for 408, 429, server, timeout,
      and network failures, including exponential jitter and configurable
      limits.
- [ ] Complete typed option and result models for every supported endpoint.
- [ ] Add a CLI for conversion, pipeline/workflow operations, and batch jobs.

### Package Readiness

- [ ] Add production build output, package exports, declaration files, and npm
      publishing metadata.
- [ ] Document Node, Bun, browser, and edge-runtime compatibility.
- [ ] Add integration coverage for each new endpoint with resource cleanup.
- [ ] Add examples for every supported API family.

Python-only synchronous wrappers are not a TypeScript parity target because the
JavaScript API is Promise-based. Deprecated Python methods such as `ocr` and
`run_custom_pipeline` should remain excluded unless the underlying API requires
compatibility aliases.
