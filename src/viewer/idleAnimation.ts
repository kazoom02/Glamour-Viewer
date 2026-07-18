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
  totalTracks: number
  boundTracks: number
  /** Tracks that resolved to no bone on the model skeleton (dropped). */
  unboundTracks: number
  /** Channels emitted (position/quaternion/scale) across all bound tracks. */
  channels: number
}

/**
 * Converts an absolute Havok clip to a stable Three.js inspection clip.
 *
 * Tracks bind by index: `transformTrackToBoneIndices` indexes the same skeleton
 * the viewer loaded from the SKLB, so `skeleton.bones[boneIndex]` is exact.
 *
 * Crucially, a channel (position/quaternion/scale) is emitted only when the clip
 * actually animates it. A spline-compressed track reports identity/zero for the
 * channels it does not touch; writing those as keyframes would force otherwise
 * static bones (e.g. the idle's hip `j_kosi`) to identity and collapse the pose.
 * Skipping them leaves the bone at its authored reference (bind) pose, which is
 * what the game does.
 */
export function animationClipFromDecoded(
  animation: DecodedAnimation,
  skeleton: THREE.Skeleton,
  bustScale: readonly [number, number, number] = [1, 1, 1],
): AnimationClipResult {
  if (animation.blendHint === 'additive') {
    throw new Error('Refusing to convert an additive animation as an absolute clip.')
  }
  const tracks: THREE.KeyframeTrack[] = []
  const bonesByName = new Map<string, THREE.Bone>()
  for (const bone of skeleton.bones) {
    bonesByName.set(bone.name, bone)
  }
  let boundTracks = 0
  for (const track of animation.tracks) {
    let bone = track.boneName
      ? bonesByName.get(track.boneName)
      : skeleton.bones[track.boneIndex]
    
    // If we bound by index, ensure we didn't accidentally bind to an appended face/hair bone.
    // Dummy PAP skeletons don't specify names, and their out-of-bounds indices for props/weapons
    // can accidentally map to the hair/face bones that we appended to the combined skeleton.
    if (!track.boneName && bone && bone.userData.isAuxiliary) {
      bone = undefined
    }

    // Emotes often contain baked garbage tracks for hair/cloth bones from the animator's reference rig.
    // In-game, Havok physics overrides these. In our viewer, applying them causes hair to explode or
    // stick straight up. We explicitly ignore hair bones so they stay in their stable bind pose.
    const lowerBoneName = bone?.name.toLowerCase() ?? ''
    if (bone && (lowerBoneName.includes('kami') || lowerBoneName.includes('hair') || lowerBoneName.includes('skirt') || lowerBoneName.includes('sode') || lowerBoneName.includes('manto'))) {
      bone = undefined
    }

    if (!bone) continue
    boundTracks += 1
    if (track.hasTranslation) {
      // FFXIV animations are shared across races/heights; applying authored translations
      // to limbs stretches them to the animator's reference rig. We only apply translations
      // to the root, hips, weapons, and IK targets.
      const allowTranslation =
        ROOT_TRANSLATION_BONES.has(bone.name) ||
        bone.name === 'n_hara' ||
        bone.name.startsWith('j_buki_') ||
        bone.name.startsWith('n_buki_') ||
        bone.name.startsWith('ik_') ||
        bone.name.startsWith('iv_') ||
        bone.name.startsWith('f_') // Allow facial translations just in case

      if (allowTranslation) {
        const translations = ROOT_TRANSLATION_BONES.has(bone.name)
          ? stableRootTranslations(track.translations)
          : track.translations
        tracks.push(new THREE.VectorKeyframeTrack(`${bone.name}.position`, animation.times, translations))
      }
    }
    if (track.hasRotation) {
      tracks.push(new THREE.QuaternionKeyframeTrack(`${bone.name}.quaternion`, animation.times, track.rotations))
    }
    if (track.hasScale) {
      const scales = BUST_BONES.has(bone.name.toLowerCase())
        ? scaledValues(track.scales, bustScale)
        : track.scales
      tracks.push(new THREE.VectorKeyframeTrack(`${bone.name}.scale`, animation.times, scales))
    }
  }
  if (!tracks.length) throw new Error('The animation has no tracks matching the selected character skeleton.')
  return {
    clip: new THREE.AnimationClip(animation.name || 'Idle', animation.duration, tracks).optimize(),
    totalTracks: animation.tracks.length,
    boundTracks,
    unboundTracks: animation.tracks.length - boundTracks,
    channels: tracks.length,
  }
}
