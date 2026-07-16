/// <reference lib="webworker" />

import { decodeSqpackModel } from './mdl'
import type { ModelDeformationRequest } from './modelLoader'
import { modelTransferBuffers } from './modelTransfer'
import { decodePbd, deformModel, HUMAN_PBD_PATH, modelRaceCode, type DecodedPbd } from './pbd'
import { createLocalModelReader } from './sqpack'
import type { AssetSource } from './types'

interface Request {
  id: number
  source: Extract<AssetSource, { kind: 'local' }>
  paths: string[]
  deformation?: ModelDeformationRequest
  shapeSelections?: Record<string, string[]>
}

self.onmessage = async (event: MessageEvent<Request>) => {
  const { id, source, paths, deformation, shapeSelections } = event.data
  try {
    const reader = createLocalModelReader(source)
    const targetRaceCode = deformation ? Number(deformation.targetRaceCode.slice(1)) : undefined
    let pbd: DecodedPbd | undefined
    let pbdError: string | undefined
    if (deformation && targetRaceCode && paths.some((path) => {
      const sourceRaceCode = modelRaceCode(path)
      return sourceRaceCode !== undefined && sourceRaceCode !== targetRaceCode
    })) {
      try {
        pbd = decodePbd(await reader.read(HUMAN_PBD_PATH))
      } catch (error) {
        pbdError = error instanceof Error ? error.message : 'human.pbd could not be decoded.'
      }
    }
    const results = []
    // File System Access handles backed by FFXIV's multi-gigabyte DAT archives can
    // fail with a generic "Failed to fetch" DOMException when Chrome snapshots the
    // same file several times concurrently. Keep one worker batch sequential: the
    // reader caches the opened files, while slices still read only requested ranges.
    for (const path of paths) {
      try {
        const payload = await reader.read(path)
        try {
          const model = await decodeSqpackModel(payload, shapeSelections?.[path] ?? [])
          let warning: string | undefined
          const sourceRaceCode = modelRaceCode(path)
          if (deformation && targetRaceCode && sourceRaceCode && sourceRaceCode !== targetRaceCode) {
            if (pbd) {
              try {
                deformModel(model, pbd, deformation.skeleton, sourceRaceCode, targetRaceCode)
              } catch (error) {
                warning = `[racial-deformation] ${path} — ${error instanceof Error ? error.message : String(error)}`
              }
            } else {
              warning = `[racial-deformation] ${path} — ${pbdError || `${HUMAN_PBD_PATH} is unavailable.`}`
            }
          }
          results.push({ path, model, warning })
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
