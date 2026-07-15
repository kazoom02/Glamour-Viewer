import type { DecodedModel } from './mdl'
import type { AssetSource } from './types'

interface WorkerResponse {
  id: number
  model?: DecodedModel
  error?: string
}

let requestId = 0

export function loadLocalEquipmentModel(
  source: Extract<AssetSource, { kind: 'local' }>,
  path: string,
): Promise<DecodedModel> {
  const worker = new Worker(new URL('./model.worker.ts', import.meta.url), { type: 'module' })
  const id = ++requestId
  return new Promise((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      if (event.data.id !== id) return
      worker.terminate()
      if (event.data.model) resolve(event.data.model)
      else reject(new Error(event.data.error || 'The FFXIV model worker returned no geometry.'))
    }
    worker.onerror = (event) => {
      worker.terminate()
      reject(new Error(event.message || 'The FFXIV model worker failed.'))
    }
    worker.postMessage({ id, source, path })
  })
}
