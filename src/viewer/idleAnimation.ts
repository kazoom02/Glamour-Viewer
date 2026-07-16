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

/** Converts an absolute Havok standing loop to a stable Three.js inspection clip. */
export function animationClipFromDecoded(
  animation: DecodedAnimation,
  skeleton: THREE.Skeleton,
  bustScale: readonly [number, number, number] = [1, 1, 1],
): THREE.AnimationClip {
  if (animation.blendHint === 'additive') {
    throw new Error('The selected idle animation is additive and cannot be used as an absolute standing pose.')
  }
  const tracks: THREE.KeyframeTrack[] = []
  for (const track of animation.tracks) {
    const bone = skeleton.bones[track.boneIndex]
    if (!bone) continue
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
  if (!tracks.length) throw new Error('The idle animation has no tracks matching the selected character skeleton.')
  return new THREE.AnimationClip(animation.name || 'Idle', animation.duration, tracks).optimize()
}
