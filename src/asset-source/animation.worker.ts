/// <reference lib="webworker" />

import { decodePap, type DecodedAnimation } from './pap'
import { decodeSklb } from './sklb'
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
        let boneNamesOverride: string[] | undefined
        const match = path.match(/chara\/human\/(c\d{4})\//)
        if (match) {
          const raceCode = match[1]
          const sklbPath = `chara/human/${raceCode}/skeleton/base/b0001/skl_${raceCode}b0001.sklb`
          try {
            const sklbBytes = await reader.read(sklbPath)
            const decodedSklb = decodeSklb(sklbBytes)
            boneNamesOverride = decodedSklb.bones.map(b => b.name)
          } catch (error) {
            // ignore
          }
        }
        const animation = decodePap(await reader.read(path), path, 30, preferName, boneNamesOverride)
        self.postMessage({ id, animation }, { transfer: transferBuffers(animation) })
        return
      } catch (error) {
        errors.push(`${path}: ${error instanceof Error ? error.stack : String(error)}`)
      }
    }
    self.postMessage({ id, error: `Animation could not be decoded. ${errors.join(' / ')}` })
  })().catch((error) => {
    self.postMessage({ id, error: error instanceof Error ? error.message : 'The animation worker failed.' })
  })
}

