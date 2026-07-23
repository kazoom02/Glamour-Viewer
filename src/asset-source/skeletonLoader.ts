import type { DecodedSkeleton } from './sklb'
import type { AssetSource } from './types'
import type { CharacterRaceCode } from './characterPlan'
import { hairSkeletonPath } from './characterPlan'
import { extraSkeletonId, HAIR_EST_PATH } from './est'
import { createLocalAssetReader } from './sqpack'

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

export async function loadLocalHairSkeleton(
  source: Extract<AssetSource, { kind: 'local' }>,
  raceCode: CharacterRaceCode,
  hairId: number,
): Promise<{ path: string; skeleton: DecodedSkeleton } | undefined> {
  let table: ArrayBuffer
  try {
    table = await createLocalAssetReader(source).read(HAIR_EST_PATH)
  } catch (reason) {
    // Hair EST is a CharacterUtility resident resource in the game client. Some
    // SqPack layouts do not expose it as a normal hashed file, so its absence
    // means that this optional auxiliary skeleton cannot be resolved. The hair
    // model still uses the race skeleton and must remain renderable.
    if (isMissingLocalSkeletonError(reason, HAIR_EST_PATH)) return undefined
    throw reason
  }
  const skeletonId = extraSkeletonId(table, Number(raceCode.slice(1)), hairId)
  if (!skeletonId) return undefined
  const path = hairSkeletonPath(raceCode, skeletonId)
  return { path, skeleton: await loadLocalSkeleton(source, path) }
}

/** Missing optional auxiliary skeletons are valid; malformed or unreadable ones are not. */
export function isMissingLocalSkeletonError(reason: unknown, path: string): boolean {
  const message = reason instanceof Error ? reason.message : String(reason)
  return message.includes(`The selected install does not contain ${path}`)
}

export type { DecodedSkeleton, DecodedSkeletonBone } from './sklb'
