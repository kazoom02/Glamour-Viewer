/// <reference lib="webworker" />

import { decodePap, type DecodedAnimation } from './pap'
import { createLocalAssetReader } from './sqpack'
import type { AssetSource } from './types'

interface Request {
  id: number
  source: Extract<AssetSource, { kind: 'local' }>
  paths: string[]
  // Optional internal track name for catalog animations; omitted for idle.
  preferName?: string
}

function transferBuffers(animation: DecodedAnimation): ArrayBuffer[] {
  const buffers = new Set<ArrayBuffer>()
  const values = [
    animation.times,
    ...animation.tracks.flatMap((track) => [track.translations, track.rotations, track.scales]),
  ]
  for (const value of values) if (value.buffer instanceof ArrayBuffer) buffers.add(value.buffer)
  return [...buffers]
}

self.onmessage = (event: MessageEvent<Request>) => {
  const { id, source, paths, preferName } = event.data
  void (async () => {
    const reader = createLocalAssetReader(source)
    const errors: string[] = []
    for (const path of paths) {
      try {
        const animation = decodePap(await reader.read(path), path, 30, preferName)
        self.postMessage({ id, animation }, { transfer: transferBuffers(animation) })
        return
      } catch (error) {
        errors.push(`${path}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    self.postMessage({ id, error: `Animation could not be decoded. ${errors.join(' / ')}` })
  })().catch((error) => {
    self.postMessage({ id, error: error instanceof Error ? error.message : 'The animation worker failed.' })
  })
}

