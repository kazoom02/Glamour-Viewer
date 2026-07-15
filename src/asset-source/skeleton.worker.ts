/// <reference lib="webworker" />

import { createLocalAssetReader } from './sqpack'
import { decodeSklb } from './sklb'
import type { AssetSource } from './types'

interface Request {
  id: number
  source: Extract<AssetSource, { kind: 'local' }>
  path: string
}

self.onmessage = (event: MessageEvent<Request>) => {
  const { id, source, path } = event.data
  void (async () => {
    try {
      const bytes = await createLocalAssetReader(source).read(path)
      self.postMessage({ id, skeleton: decodeSklb(bytes) })
    } catch (error) {
      self.postMessage({ id, error: error instanceof Error ? error.message : 'The skeleton worker failed.' })
    }
  })()
}
