import type { DecodedSkeleton } from './sklb'
import type { AssetSource } from './types'

interface Response {
  id: number
  skeleton?: DecodedSkeleton
  error?: string
}

let requestId = 0
let worker: Worker | undefined

function skeletonWorker(): Worker {
  worker ??= new Worker(new URL('./skeleton.worker.ts', import.meta.url), { type: 'module' })
  return worker
}

export function loadLocalSkeleton(
  source: Extract<AssetSource, { kind: 'local' }>,
  path: string,
): Promise<DecodedSkeleton> {
  const activeWorker = skeletonWorker()
  const id = ++requestId
  return new Promise((resolve, reject) => {
    const onMessage = (event: MessageEvent<Response>) => {
      if (event.data.id !== id) return
      cleanup()
      if (event.data.skeleton) resolve(event.data.skeleton)
      else reject(new Error(event.data.error || 'The skeleton worker returned no data.'))
    }
    const onError = (event: ErrorEvent) => {
      cleanup()
      worker?.terminate()
      worker = undefined
      reject(new Error(event.message || 'The skeleton worker failed.'))
    }
    const cleanup = () => {
      activeWorker.removeEventListener('message', onMessage)
      activeWorker.removeEventListener('error', onError)
    }
    activeWorker.addEventListener('message', onMessage)
    activeWorker.addEventListener('error', onError)
    activeWorker.postMessage({ id, source, path })
  })
}

export type { DecodedSkeleton, DecodedSkeletonBone } from './sklb'
