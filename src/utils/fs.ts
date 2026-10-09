import { extname, basename } from 'node:path'
import { readFile } from 'node:fs/promises'
import mime from 'mime-types'

export function fileMimeType(path: string) {
  return mime.lookup(extname(path)) ?? 'application/octet-stream'
}

export function fileNameFromPath(path: string) {
  return basename(path)
}

export async function fileToBlob(path: string) {
  const bytes = await readFile(new URL(path, import.meta.url))
  const mimeType = fileMimeType(path)
  if (!mimeType) {
    throw new Error(`Unsupported file type: ${path}`)
  }
  return new Blob([bytes], { type: mimeType })
}
