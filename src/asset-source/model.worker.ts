/// <reference lib="webworker" />

import { decodeSqpackModel } from './mdl'
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
        results.push({ path, model: await decodeSqpackModel(await reader.read(path)) })
      } catch (error) {
        results.push({ path, error: error instanceof Error ? error.message : 'The FFXIV model could not be decoded.' })
      }
    }
    const transfer = results.flatMap((result) => result.model?.meshes.flatMap((mesh) => [
      mesh.positions.buffer, mesh.normals?.buffer, mesh.uvs?.buffer,
      mesh.skinIndices?.buffer, mesh.skinWeights?.buffer, mesh.indices.buffer,
    ]) ?? [])
      .filter((buffer): buffer is ArrayBuffer => buffer instanceof ArrayBuffer)
    self.postMessage({ id, results }, { transfer })
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : 'The FFXIV model could not be decoded.' })
  }
}
