import * as THREE from 'three'
import type { DecodedAnimation } from '../asset-source/animationLoader'

// Only the scene root carries locomotion drift. n_hara is the animated hips;
// freezing it removes the authored breathing and weight-shift of standing idle.
const ROOT_TRANSLATION_BONES = new Set(['n_root'])
const BUST_BONES = new Set(['j_mune_l', 'j_mune_r'])

function stableRootTranslations(values: Float32Array): Float32Array {
  const result = new Float32Array(values)
  for (let offset = 3; offset < result.length; offset += 3) {
    result[offset] = result[0]!
    result[offset + 1] = result[1]!
    result[offset + 2] = result[2]!
  }
  return result
}

function scaledValues(values: Float32Array, multiplier: readonly [number, number, number]): Float32Array {
  const result = new Float32Array(values)
  for (let offset = 0; offset + 2 < result.length; offset += 3) {
    result[offset] = result[offset]! * multiplier[0]
    result[offset + 1] = result[offset + 1]! * multiplier[1]
    result[offset + 2] = result[offset + 2]! * multiplier[2]
  }
  return result
}

export interface AnimationClipResult {
  clip: THREE.AnimationClip
  /** How tracks were bound to the model skeleton. */
  boundBy: 'name' | 'index'
  totalTracks: number
  boundTracks: number
  /** Tracks that resolved to no bone on the model skeleton (dropped). */
  unboundTracks: number
}

/**
 * Converts an absolute Havok clip to a stable Three.js inspection clip.
 *
 * Tracks bind to the model skeleton by bone *name* when the animation carries one
 * (`transformTrackToBoneIndices` is only valid against the clip's own authored
 * skeleton, so binding by raw index explodes any clip whose skeleton order differs
 * from the model's combined skeleton). Only when no names are present does it fall
 * back to index binding.
 */
export function animationClipFromDecoded(
  animation: DecodedAnimation,
  skeleton: THREE.Skeleton,
  bustScale: readonly [number, number, number] = [1, 1, 1],
): AnimationClipResult {
  if (animation.blendHint === 'additive') {
    throw new Error('The selected animation is additive and cannot be used as an absolute standing pose.')
  }
  const useNames = animation.boneNamesResolved && animation.tracks.some((track) => track.boneName)
  const bonesByName = useNames ? new Map(skeleton.bones.map((bone) => [bone.name, bone])) : undefined
  const tracks: THREE.KeyframeTrack[] = []
  let boundTracks = 0
  for (const track of animation.tracks) {
    // Prefer the authored bone name; fall back to raw index so name binding can
    // never drop a track that index binding would have matched.
    const named = track.boneName ? bonesByName?.get(track.boneName) : undefined
    const bone = named ?? skeleton.bones[track.boneIndex]
    if (!bone) continue
    boundTracks += 1
    const translations = ROOT_TRANSLATION_BONES.has(bone.name)
      ? stableRootTranslations(track.translations)
      : track.translations
    const scales = BUST_BONES.has(bone.name.toLowerCase())
      ? scaledValues(track.scales, bustScale)
      : track.scales
    tracks.push(
      new THREE.VectorKeyframeTrack(`${bone.name}.position`, animation.times, translations),
      new THREE.QuaternionKeyframeTrack(`${bone.name}.quaternion`, animation.times, track.rotations),
      new THREE.VectorKeyframeTrack(`${bone.name}.scale`, animation.times, scales),
    )
  }
  if (!tracks.length) throw new Error('The animation has no tracks matching the selected character skeleton.')
  return {
    clip: new THREE.AnimationClip(animation.name || 'Idle', animation.duration, tracks).optimize(),
    boundBy: useNames ? 'name' : 'index',
    totalTracks: animation.tracks.length,
    boundTracks,
    unboundTracks: animation.tracks.length - boundTracks,
  }
}
