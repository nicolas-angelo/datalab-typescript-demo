import { z } from 'zod'

import type { JsonSchema, PageSchema } from './types'

export function isZodPageSchema(schema: unknown): schema is z.ZodObject {
  return schema instanceof z.ZodObject
}

export function toJsonSchema(
  schema: PageSchema | undefined
): JsonSchema | undefined {
  return isZodPageSchema(schema) ? z.toJSONSchema(schema) : schema
}

/**
 * Unwrap the semantic payload returned by Datalab extraction steps.
 * Non-extraction step results are returned unchanged.
 */
export function unwrapDatalabResult(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value

  const result = value as Record<string, unknown>
  const payload =
    result.extraction_schema_json ?? result.extractionSchemaJson ?? result

  if (typeof payload !== 'string') return payload
  return JSON.parse(payload)
}
