/// <reference lib="webworker" />

import { decodeSqpackModel } from './mdl'
import { readLocalModelPayload } from './sqpack'
import type { AssetSource } from './types'

interface Request {
  id: number
  source: Extract<AssetSource, { kind: 'local' }>
  path: string
}

self.onmessage = async (event: MessageEvent<Request>) => {
  const { id, source, path } = event.data
  try {
    const model = await decodeSqpackModel(await readLocalModelPayload(source, path))
    const transfer = model.meshes.flatMap((mesh) => [mesh.positions.buffer, mesh.normals?.buffer, mesh.uvs?.buffer, mesh.indices.buffer])
      .filter((buffer): buffer is ArrayBuffer => buffer instanceof ArrayBuffer)
    self.postMessage({ id, model }, { transfer })
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : 'The FFXIV model could not be decoded.' })
  }
}
