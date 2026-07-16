import type { MaterialLoadRequest, MaterialLoadResult } from './materialTypes'
import type { AssetSource } from './types'

interface WorkerResponse {
  id: number
  results?: MaterialLoadResult[]
  error?: string
}

let requestId = 0
let worker: Worker | undefined

function materialWorker(): Worker {
  worker ??= new Worker(new URL('./material.worker.ts', import.meta.url), { type: 'module' })
  return worker
}

export function loadLocalMaterials(
  source: Extract<AssetSource, { kind: 'local' }>,
  requests: MaterialLoadRequest[],
): Promise<MaterialLoadResult[]> {
  const activeWorker = materialWorker()
  const id = ++requestId
  return new Promise((resolve, reject) => {
    const onMessage = (event: MessageEvent<WorkerResponse>) => {
      if (event.data.id !== id) return
      activeWorker.removeEventListener('message', onMessage)
      activeWorker.removeEventListener('error', onError)
      if (event.data.results) resolve(event.data.results)
      else reject(new Error(event.data.error || 'The material worker returned no data.'))
    }
    const onError = (event: ErrorEvent) => {
      activeWorker.removeEventListener('message', onMessage)
      activeWorker.removeEventListener('error', onError)
      worker?.terminate()
      worker = undefined
      reject(new Error(event.message || 'The material worker failed.'))
    }
    activeWorker.addEventListener('message', onMessage)
    activeWorker.addEventListener('error', onError)
    activeWorker.postMessage({ id, source, requests })
  })
}

export type { DecodedMaterial, MaterialLoadRequest, MaterialLoadResult } from './materialTypes'
export type { DecodedMaterialAnimation, DecodedMaterialAnimationTrack } from './materialAnimation'
