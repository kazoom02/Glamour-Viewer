/// <reference lib="webworker" />

import { decodeSqpackModel } from './mdl'
import { modelTransferBuffers } from './modelTransfer'
import { createLocalModelReader } from './sqpack'
import type { AssetSource } from './types'

interface Request {
  id: number
  source: Extract<AssetSource, { kind: 'local' }>
  paths: string[]
}

self.onmessage = async (event: MessageEvent<Request>) => {
  const { id, source, paths } = event.data
  try {
    const reader = createLocalModelReader(source)
    const results = []
    // File System Access handles backed by FFXIV's multi-gigabyte DAT archives can
    // fail with a generic "Failed to fetch" DOMException when Chrome snapshots the
    // same file several times concurrently. Keep one worker batch sequential: the
    // reader caches the opened files, while slices still read only requested ranges.
    for (const path of paths) {
      try {
        const payload = await reader.read(path)
        try {
          results.push({ path, model: await decodeSqpackModel(payload) })
        } catch (error) {
          const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
          throw new Error(`[decode-model] ${path} — ${detail}`)
        }
      } catch (error) {
        const detail = error instanceof Error ? `${error.name}: ${error.message}` : 'The FFXIV model could not be decoded.'
        results.push({ path, error: `${path}\n${detail}` })
      }
    }
    const transfer = modelTransferBuffers(results)
    self.postMessage({ id, results }, { transfer })
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : 'The FFXIV model could not be decoded.' })
  }
}
