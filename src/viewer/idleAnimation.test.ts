import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { animationClipFromDecoded } from './idleAnimation'
import type { DecodedAnimation } from '../asset-source/animationLoader'

function animation(blendHint: DecodedAnimation['blendHint'] = 'normal'): DecodedAnimation {
  return {
    name: 'cbnm_id0',
    path: 'idle.pap',
    blendHint,
    duration: 1,
    times: new Float32Array([0, 0.5, 1]),
    tracks: [{
      boneIndex: 0,
      translations: new Float32Array([0, 1, 0, 0.2, 1.1, -0.1, 0.4, 0.9, -0.2]),
      rotations: new Float32Array([0, 0, 0, 1, 0, 0.1, 0, 0.995, 0, 0, 0, 1]),
      scales: new Float32Array([1, 1, 1, 1, 1, 1, 1, 1, 1]),
    }],
  }
}

describe('idle animation clip', () => {
  it('keeps the character root planted while retaining rotation motion', () => {
    const root = new THREE.Bone()
    root.name = 'n_root'
    const clip = animationClipFromDecoded(animation(), new THREE.Skeleton([root]))
    const position = clip.tracks.find((track) => track.name.endsWith('.position'))!
    const rotation = clip.tracks.find((track) => track.name.endsWith('.quaternion'))!
    expect(Array.from(position.values).every((value, index) => value === [0, 1, 0][index % 3])).toBe(true)
    expect(rotation.values.length).toBeGreaterThan(4)
  })

  it('retains authored hip translation for breathing and weight shift', () => {
    const hips = new THREE.Bone()
    hips.name = 'n_hara'
    const clip = animationClipFromDecoded(animation(), new THREE.Skeleton([hips]))
    const position = clip.tracks.find((track) => track.name.endsWith('.position'))!
    expect(Array.from(position.values)).toEqual(Array.from(animation().tracks[0]!.translations))
  })

  it('refuses additive clips instead of applying deltas as absolute transforms', () => {
    const root = new THREE.Bone()
    root.name = 'n_hara'
    expect(() => animationClipFromDecoded(animation('additive'), new THREE.Skeleton([root]))).toThrow('additive')
  })

  it('preserves CMP bust scaling in animation scale tracks', () => {
    const breast = new THREE.Bone()
    breast.name = 'j_mune_l'
    const clip = animationClipFromDecoded(animation(), new THREE.Skeleton([breast]), [1.2, 1.3, 1.4])
    const scale = clip.tracks.find((track) => track.name === 'j_mune_l.scale')
    expect(Array.from(scale!.values.slice(0, 3))).toEqual([
      expect.closeTo(1.2), expect.closeTo(1.3), expect.closeTo(1.4),
    ])
  })
})
