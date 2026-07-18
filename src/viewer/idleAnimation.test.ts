import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { animationClipFromDecoded } from './idleAnimation'
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
