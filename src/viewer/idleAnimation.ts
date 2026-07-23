import * as THREE from 'three'
import type { DecodedAnimation } from '../asset-source/animationLoader'

// Only the scene root carries locomotion drift. n_hara is the animated hips;
// freezing it removes the authored breathing and weight-shift of standing idle.
const ROOT_TRANSLATION_BONES = new Set(['n_root'])
const BUST_BONES = new Set(['j_mune_l', 'j_mune_r'])
const SAGE_WEAPON_TRANSLATION_BONES = new Set(['n_hara', 'n_haraB', 'n_haraC', 'n_haraD'])

/** Bones driven by the game's secondary-motion simulation, not pose clips. */
function isPhysicsDrivenBone(name: string): boolean {
  const lower = name.toLowerCase()
  return lower.includes('kami')
    || lower.includes('hair')
    || lower.startsWith('j_ex_h')
    || lower.includes('skirt')
    || lower.includes('sode')
    || lower.includes('manto')
}

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

/**
 * FFXIV arm-chain joints on both sides: clavicle/shoulder → upper arm → forearm →
 * hand → fingers, plus the elbow/shoulder helper bones and the held-weapon mounts
 * that ride on the hands. Matching is by prefix so every `_l`/`_r` pair and every
 * finger segment (`_a`/`_b`) is covered. The trailing underscore on `j_ko_` is what
 * keeps the hip (`j_kosi`) out of the pinky (`j_ko_a_l`) match.
 */
const ARM_BONE_PREFIXES = [
  'j_kata_', 'n_hkata_', 'n_sako_', // clavicle / shoulder (+ helper)
  'j_ude_', 'n_hhiji_', 'n_hijisoubi_', // upper + fore arm, elbow helpers
  'j_te_', 'n_hte_', // hand (+ helper)
  'j_oya_', 'j_hito_', 'j_naka_', 'j_kusu_', 'j_ko_', // thumb, index, middle, ring, pinky
  'j_buki', 'n_buki_', // weapon mounts carried by the hands
] as const

/** Whether a bone belongs to either arm chain (see {@link ARM_BONE_PREFIXES}). */
export function isArmBone(boneName: string): boolean {
  return ARM_BONE_PREFIXES.some((prefix) => boneName.startsWith(prefix))
}

/**
 * Builds a draw/sheath clip that only moves the arms: arm-chain tracks come from
 * the authored full-body `transition`, every other bone (spine, legs, head, hips)
 * comes from the `restingIdle` the character settles into afterward. Playing this
 * as a one-shot lets the arms reach for the weapon while the rest of the body keeps
 * looping its idle, with no track driven by both sources. If the transition has no
 * arm tracks, the original full-body clip is returned unchanged.
 */
export function composeArmTransition(
  transition: THREE.AnimationClip,
  restingIdle: THREE.AnimationClip,
): THREE.AnimationClip {
  const boneOf = (track: THREE.KeyframeTrack) => track.name.split('.')[0] ?? ''
  const armTracks = transition.tracks.filter((track) => isArmBone(boneOf(track)))
  if (!armTracks.length) return transition
  const bodyTracks = restingIdle.tracks.filter((track) => !isArmBone(boneOf(track)))
  return new THREE.AnimationClip(
    transition.name || 'Draw weapon',
    transition.duration,
    [...bodyTracks, ...armTracks],
  )
}

/** The arm-chain tracks of a clip (see {@link isArmBone}) as a standalone clip. */
export function onlyArmBoneClip(clip: THREE.AnimationClip): THREE.AnimationClip {
  const boneOf = (track: THREE.KeyframeTrack) => track.name.split('.')[0] ?? ''
  return new THREE.AnimationClip(
    clip.name || 'arms',
    clip.duration,
    clip.tracks.filter((track) => isArmBone(boneOf(track))),
  )
}

/** A clip with its arm-chain tracks removed — keeps spine, legs, head and hips. */
export function withoutArmBoneClip(clip: THREE.AnimationClip): THREE.AnimationClip {
  const boneOf = (track: THREE.KeyframeTrack) => track.name.split('.')[0] ?? ''
  return new THREE.AnimationClip(
    clip.name || 'body',
    clip.duration,
    clip.tracks.filter((track) => !isArmBone(boneOf(track))),
  )
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
    if (bone && isPhysicsDrivenBone(bone.name)) {
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
        SAGE_WEAPON_TRANSLATION_BONES.has(bone.name) ||
        bone.name.startsWith('j_buki') ||
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
