import type { DecodedAnimation } from './pap'
import type { AssetSource } from './types'

interface WorkerResponse {
  id: number
  animation?: DecodedAnimation
  error?: string
}

let requestId = 0

export function loadLocalIdleAnimation(
  source: Extract<AssetSource, { kind: 'local' }>,
  paths: string[],
): Promise<DecodedAnimation> {
  const worker = new Worker(new URL('./animation.worker.ts', import.meta.url), { type: 'module' })
  const id = ++requestId
  return new Promise((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      if (event.data.id !== id) return
      worker.terminate()
      if (event.data.animation) resolve(event.data.animation)
      else reject(new Error(event.data.error || 'The idle animation worker returned no clip.'))
    }
    worker.onerror = (event) => {
      worker.terminate()
      reject(new Error(event.message || 'The idle animation worker failed.'))
    }
    worker.postMessage({ id, source, paths })
  })
}

export type { DecodedAnimation, DecodedAnimationTrack } from './pap'

