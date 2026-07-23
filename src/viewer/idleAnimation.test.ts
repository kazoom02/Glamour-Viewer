import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { animationClipFromDecoded, composeArmTransition, isArmBone } from './idleAnimation'
import type { DecodedAnimation, DecodedAnimationTrack } from '../asset-source/animationLoader'

function track(overrides: Partial<DecodedAnimationTrack> = {}): DecodedAnimationTrack {
  return {
    boneIndex: 0,
    hasTranslation: true,
    hasRotation: true,
    hasScale: true,
    translations: new Float32Array([0, 1, 0, 0.2, 1.1, -0.1, 0.4, 0.9, -0.2]),
    rotations: new Float32Array([0, 0, 0, 1, 0, 0.1, 0, 0.995, 0, 0, 0, 1]),
    scales: new Float32Array([1, 1, 1, 1, 1, 1, 1, 1, 1]),
    ...overrides,
  }
}

function animation(blendHint: DecodedAnimation['blendHint'] = 'normal', tracks = [track()]): DecodedAnimation {
  return {
    name: 'cbnm_id0',
    path: 'idle.pap',
    blendHint,
    duration: 1,
    times: new Float32Array([0, 0.5, 1]),
    tracks,
  }
}

describe('idle animation clip', () => {
  it('keeps the character root planted while retaining rotation motion', () => {
    const root = new THREE.Bone()
    root.name = 'n_root'
    const { clip } = animationClipFromDecoded(animation(), new THREE.Skeleton([root]))
    const position = clip.tracks.find((t) => t.name.endsWith('.position'))!
    const rotation = clip.tracks.find((t) => t.name.endsWith('.quaternion'))!
    expect(Array.from(position.values).every((value, index) => value === [0, 1, 0][index % 3])).toBe(true)
    expect(rotation.values.length).toBeGreaterThan(4)
  })

  it('retains authored hip translation for breathing and weight shift', () => {
    const hips = new THREE.Bone()
    hips.name = 'n_hara'
    const { clip } = animationClipFromDecoded(animation(), new THREE.Skeleton([hips]))
    const position = clip.tracks.find((t) => t.name.endsWith('.position'))!
    expect(Array.from(position.values)).toEqual(Array.from(track().translations))
  })

  it('retains translations for the second pair of Sage weapon mounts', () => {
    const mount = new THREE.Bone()
    mount.name = 'j_buki2_kosi_l'
    const { clip } = animationClipFromDecoded(animation(), new THREE.Skeleton([mount]))
    const position = clip.tracks.find((candidate) => candidate.name === 'j_buki2_kosi_l.position')
    expect(Array.from(position!.values)).toEqual(Array.from(track().translations))
  })

  it('retains authored translations for all four w2702 noulith roots', () => {
    for (const name of ['n_hara', 'n_haraB', 'n_haraC', 'n_haraD']) {
      const bone = new THREE.Bone()
      bone.name = name
      const { clip } = animationClipFromDecoded(animation(), new THREE.Skeleton([bone]))
      const position = clip.tracks.find((candidate) => candidate.name === `${name}.position`)
      expect(position, name).toBeDefined()
      expect(Array.from(position!.values), name).toEqual(Array.from(track().translations))
    }
  })

  it('refuses additive clips instead of applying deltas as absolute transforms', () => {
    const root = new THREE.Bone()
    root.name = 'n_hara'
    expect(() => animationClipFromDecoded(animation('additive'), new THREE.Skeleton([root]))).toThrow('additive')
  })

  it('preserves CMP bust scaling in animated scale tracks', () => {
    const breast = new THREE.Bone()
    breast.name = 'j_mune_l'
    const { clip } = animationClipFromDecoded(animation(), new THREE.Skeleton([breast]), [1.2, 1.3, 1.4])
    const scale = clip.tracks.find((t) => t.name === 'j_mune_l.scale')
    expect(Array.from(scale!.values.slice(0, 3))).toEqual([
      expect.closeTo(1.2), expect.closeTo(1.3), expect.closeTo(1.4),
    ])
  })

  it('emits no keyframe track for a channel the clip does not animate', () => {
    // A bone that only has an animated rotation must NOT get a position or scale
    // track — otherwise it snaps to zero/identity instead of keeping its bind pose.
    const bone = new THREE.Bone(); bone.name = 'j_kosi'
    const { clip, channels } = animationClipFromDecoded(
      animation('normal', [track({ hasTranslation: false, hasScale: false })]),
      new THREE.Skeleton([bone]),
    )
    expect(clip.tracks.some((t) => t.name === 'j_kosi.quaternion')).toBe(true)
    expect(clip.tracks.some((t) => t.name === 'j_kosi.position')).toBe(false)
    expect(clip.tracks.some((t) => t.name === 'j_kosi.scale')).toBe(false)
    expect(channels).toBe(1)
  })

  it('drops tracks whose bone index is absent from the model skeleton', () => {
    const root = new THREE.Bone(); root.name = 'n_root'
    const { boundTracks, unboundTracks, totalTracks } = animationClipFromDecoded(
      animation('normal', [track({ boneIndex: 0 }), track({ boneIndex: 5 })]),
      new THREE.Skeleton([root]),
    )
    expect(totalTracks).toBe(2)
    expect(boundTracks).toBe(1)
    expect(unboundTracks).toBe(1)
  })

  it('classifies the arm chain and only the arm chain', () => {
    for (const arm of [
      'j_kata_l', 'j_kata_r', 'j_ude_a_l', 'j_ude_b_r', 'n_hhiji_l', 'n_hijisoubi_r',
      'j_te_l', 'j_te_r', 'j_oya_a_l', 'j_hito_b_r', 'j_naka_a_l', 'j_kusu_b_r', 'j_ko_a_l',
      'j_buki_l', 'n_buki_r',
    ]) {
      expect(isArmBone(arm), arm).toBe(true)
    }
    for (const body of [
      'n_root', 'n_hara', 'j_kosi', 'j_kubi', 'j_sebo_a', 'j_asi_a_l', 'j_mune_l', 'j_kao',
    ]) {
      expect(isArmBone(body), body).toBe(false)
    }
  })

  it('composes a draw clip with arms from the transition and body from the idle', () => {
    const armTrack = new THREE.QuaternionKeyframeTrack('j_ude_b_l.quaternion', [0, 1], [0, 0, 0, 1, 0, 0.1, 0, 0.995])
    const transitionSpine = new THREE.QuaternionKeyframeTrack('j_sebo_a.quaternion', [0, 1], [0, 0, 0, 1, 0, 0.2, 0, 0.98])
    const transition = new THREE.AnimationClip('cbbp_a_activ', 0.8, [armTrack, transitionSpine])
    const idleSpine = new THREE.QuaternionKeyframeTrack('j_sebo_a.quaternion', [0, 2], [0, 0, 0, 1, 0, 0, 0, 1])
    const idleArm = new THREE.QuaternionKeyframeTrack('j_ude_b_l.quaternion', [0, 2], [0, 0, 0, 1, 0, 0, 0, 1])
    const resting = new THREE.AnimationClip('idle', 2, [idleSpine, idleArm])

    const composed = composeArmTransition(transition, resting)
    expect(composed.duration).toBe(0.8)
    // Arm comes from the transition (its values), spine comes from the idle.
    const arm = composed.tracks.find((t) => t.name === 'j_ude_b_l.quaternion')!
    const spine = composed.tracks.find((t) => t.name === 'j_sebo_a.quaternion')!
    expect(Array.from(arm.values)).toEqual(Array.from(armTrack.values))
    expect(Array.from(spine.values)).toEqual(Array.from(idleSpine.values))
    // No bone is driven twice.
    expect(composed.tracks.filter((t) => t.name === 'j_ude_b_l.quaternion')).toHaveLength(1)
  })

  it('returns the full transition unchanged when it has no arm tracks', () => {
    const spine = new THREE.QuaternionKeyframeTrack('j_sebo_a.quaternion', [0, 1], [0, 0, 0, 1, 0, 0.2, 0, 0.98])
    const transition = new THREE.AnimationClip('cbbp_a_activ', 0.8, [spine])
    const resting = new THREE.AnimationClip('idle', 2, [
      new THREE.QuaternionKeyframeTrack('j_sebo_a.quaternion', [0, 2], [0, 0, 0, 1, 0, 0, 0, 1]),
    ])
    expect(composeArmTransition(transition, resting)).toBe(transition)
  })

  it('drops generic and hairstyle-specific secondary-hair tracks', () => {
    const root = new THREE.Bone(); root.name = 'n_root'
    const hair = new THREE.Bone(); hair.name = 'J_KAMI_A'
    const styleHair = new THREE.Bone(); styleHair.name = 'j_ex_h0102_ke_l'
    const { clip, boundTracks, unboundTracks } = animationClipFromDecoded(
      animation('normal', [
        track({ boneIndex: 0, boneName: 'n_root' }),
        track({ boneIndex: 1, boneName: 'J_KAMI_A' }),
        track({ boneIndex: 2, boneName: 'j_ex_h0102_ke_l' }),
      ]),
      new THREE.Skeleton([root, hair, styleHair]),
    )
    expect(clip.tracks.some((candidate) => candidate.name.startsWith('J_KAMI_A.'))).toBe(false)
    expect(clip.tracks.some((candidate) => candidate.name.startsWith('j_ex_h0102.'))).toBe(false)
    expect(boundTracks).toBe(1)
    expect(unboundTracks).toBe(2)
  })
})
