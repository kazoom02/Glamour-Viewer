import type { DecodedAnimation } from './pap'
import type { AssetSource } from './types'

interface WorkerResponse {
  id: number
  animation?: DecodedAnimation
  error?: string
}

let requestId = 0

/**
 * Decodes the first PAP that resolves from `paths` in a module worker. When
 * `preferName` is given, that named track is selected inside the PAP (catalog
 * animations); otherwise the idle loop is chosen. Paths are tried in order so a
 * race can fall back to a shared ancestor's animation.
 */
export function loadLocalAnimation(
  source: Extract<AssetSource, { kind: 'local' }>,
  paths: string[],
  preferName?: string,
): Promise<DecodedAnimation> {
  const worker = new Worker(new URL('./animation.worker.ts', import.meta.url), { type: 'module' })
  const id = ++requestId
  return new Promise((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      if (event.data.id !== id) return
      worker.terminate()
      if (event.data.animation) resolve(event.data.animation)
      else reject(new Error(event.data.error || 'The animation worker returned no clip.'))
    }
    worker.onerror = (event) => {
      worker.terminate()
      reject(new Error(event.message || 'The animation worker failed.'))
    }
    worker.postMessage({ id, source, paths, preferName })
  })
}

/** Decodes the standing idle loop for a race (no named track). */
export function loadLocalIdleAnimation(
  source: Extract<AssetSource, { kind: 'local' }>,
  paths: string[],
): Promise<DecodedAnimation> {
  return loadLocalAnimation(source, paths)
}

export type { DecodedAnimation, DecodedAnimationTrack } from './pap'

