import { describe, expect, it } from 'vitest'
import type { DecodedAnimation } from './pap'
import type { DecodedSkeleton } from './sklb'
import {
  materialAnimationFromDecoded,
  materialAnimationTrack,
  sampleMaterialAnimationTrack,
} from './materialAnimation'

function fixture() {
  const animation: DecodedAnimation = {
    name: 'weapon glow',
    path: 'material.pap',
    blendHint: 'normal',
    duration: 1,
    times: new Float32Array([0, 0.5, 1]),
    boneNamesResolved: false,
    tracks: [
      { boneIndex: 0, translations: new Float32Array(9), rotations: new Float32Array(12), scales: new Float32Array(9) },
      {
        boneIndex: 1,
        translations: new Float32Array([0, 0.2, 1, 0.5, 0.6, 0.4, 1, 0.8, 0]),
        rotations: new Float32Array(12),
        scales: new Float32Array(9),
      },
    ],
  }
  const skeleton: DecodedSkeleton = { bones: [
    { name: 'n_material', parentIndex: -1, translation: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
    { name: 'n_material_a', parentIndex: 0, translation: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
  ] }
  return materialAnimationFromDecoded(animation, skeleton)
}

describe('equipment material animation', () => {
  it('uses non-root material skeleton translations as RGB tracks', () => {
    const animation = fixture()
    expect(animation.tracks).toHaveLength(1)
    expect(animation.tracks[0]?.name).toBe('n_material_a')
    expect(materialAnimationTrack(animation, 0)).toBe(animation.tracks[0])
  })

  it('interpolates authored colors and loops at the PAP duration', () => {
    const animation = fixture()
    const track = animation.tracks[0]!
    expect(sampleMaterialAnimationTrack(animation, track, 0.25)).toEqual([0.25, 0.4000000134110451, 0.7000000029802322])
    expect(sampleMaterialAnimationTrack(animation, track, 1.25)).toEqual([0.25, 0.4000000134110451, 0.7000000029802322])
  })
})
