import type { DecodedModel } from './mdl'
import type { DecodedSkeleton } from './sklb'
import type { AssetSource } from './types'

export interface ModelLoadResult {
  path: string
  model?: DecodedModel
  error?: string
  warning?: string
}

export interface ModelDeformationRequest {
  targetRaceCode: string
  skeleton: DecodedSkeleton
}

interface WorkerResponse {
  id: number
  results?: ModelLoadResult[]
  error?: string
}

let requestId = 0

export function loadLocalModels(
  source: Extract<AssetSource, { kind: 'local' }>,
  paths: string[],
  deformation?: ModelDeformationRequest,
  shapeSelections?: Record<string, string[]>,
): Promise<ModelLoadResult[]> {
  const worker = new Worker(new URL('./model.worker.ts', import.meta.url), { type: 'module' })
  const id = ++requestId
  return new Promise((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      if (event.data.id !== id) return
      worker.terminate()
      if (event.data.results) resolve(event.data.results)
      else reject(new Error(event.data.error || 'The FFXIV model worker returned no geometry.'))
    }
    worker.onerror = (event) => {
      worker.terminate()
      reject(new Error(event.message || 'The FFXIV model worker failed.'))
    }
    worker.postMessage({ id, source, paths, deformation, shapeSelections })
  })
}

export async function loadLocalEquipmentModel(
  source: Extract<AssetSource, { kind: 'local' }>,
  path: string,
): Promise<DecodedModel> {
  const [result] = await loadLocalModels(source, [path])
  if (result?.model) return result.model
  throw new Error(result?.error || 'The FFXIV model worker returned no geometry.')
}
