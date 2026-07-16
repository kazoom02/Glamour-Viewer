import { describe, expect, it } from 'vitest'
import {
  bakeCharacterMaterial,
  bakeHairMaterial,
  bakeTattooMaterial,
  materialAlphaMode,
  usesCharacterColorTable,
} from './materialBake'
import type { MaterialColorTable } from './mtrl'
import { TEX_FORMAT, type DecodedTexture } from './tex'

function texture(rgba: number[]): DecodedTexture {
  return { width: 1, height: 1, format: TEX_FORMAT.B8G8R8A8, rgba: Uint8Array.from(rgba) }
}

describe('character colorset baking', () => {
  it('selects and applies a Dawntrail colorset row pair', () => {
    const rows = Array.from({ length: 32 }, () => ({
      diffuse: [0, 0, 0] as [number, number, number],
      specular: [0, 0, 0] as [number, number, number],
      specularMask: 1,
      emissive: [0, 0, 0] as [number, number, number],
      roughness: 1,
      metalness: 0,
    }))
    rows[2]!.diffuse = [0.25, 0.25, 0.25]
    rows[2]!.metalness = 1
    rows[3]!.diffuse = [1, 1, 1]
    rows[3]!.metalness = 1
    const table: MaterialColorTable = { kind: 'dawntrail', rows }
    const result = bakeCharacterMaterial(table, {
      index: texture([17, 128, 0, 255]),
      diffuse: texture([255, 255, 255, 255]),
      mask: texture([255, 255, 255, 255]),
    })!
    expect(Array.from(result.diffuse.rgba.slice(0, 3))).toEqual([207, 207, 207])
    expect(Array.from(result.metalness.rgba.slice(0, 3))).toEqual([0, 0, 0])
  })

  it('keeps legacy ambient occlusion, roughness and specular controls separate', () => {
    const rows = Array.from({ length: 16 }, () => ({
      diffuse: [1, 1, 1] as [number, number, number],
      specular: [1, 1, 1] as [number, number, number],
      specularMask: 0.5,
      emissive: [0, 0, 0] as [number, number, number],
      roughness: 0.5,
      metalness: 0,
    }))
    const table: MaterialColorTable = { kind: 'legacy', rows }
    const result = bakeCharacterMaterial(table, {
      normal: texture([128, 128, 0, 255]),
      diffuse: texture([255, 255, 255, 255]),
      mask: texture([32, 255, 0, 255]),
    }, 'characterlegacy.shpk')!

    expect(Array.from(result.diffuse.rgba.slice(0, 3))).toEqual([255, 255, 255])
    expect(Array.from(result.ao.rgba.slice(0, 3))).toEqual([0, 0, 0])
    expect(Array.from(result.roughness.rgba.slice(0, 3))).toEqual([255, 255, 255])
    expect(result.specularIntensity.rgba[3]).toBe(16)
  })

  it('uses modern mask roughness directly instead of multiplying it down', () => {
    const rows = Array.from({ length: 32 }, () => ({
      diffuse: [1, 1, 1] as [number, number, number],
      specular: [0, 0, 0] as [number, number, number],
      specularMask: 1,
      emissive: [0, 0, 0] as [number, number, number],
      roughness: 0.5,
      metalness: 0,
    }))
    const result = bakeCharacterMaterial({ kind: 'dawntrail', rows }, {
      index: texture([0, 255, 0, 255]),
      mask: texture([255, 128, 255, 255]),
    }, 'character.shpk')!

    expect(Array.from(result.roughness.rgba.slice(0, 3))).toEqual([128, 128, 128])
  })

  it('keeps very smooth character rows above the wet-looking roughness range', () => {
    const rows = Array.from({ length: 32 }, () => ({
      diffuse: [1, 1, 1] as [number, number, number],
      specular: [1, 1, 1] as [number, number, number],
      specularMask: 1,
      emissive: [0, 0, 0] as [number, number, number],
      roughness: 0.05,
      metalness: 0,
    }))
    const result = bakeCharacterMaterial({ kind: 'dawntrail', rows }, {
      index: texture([0, 255, 0, 255]),
      mask: texture([255, 16, 255, 255]),
    }, 'character.shpk')!

    expect(result.roughness.rgba[0]).toBe(92)
  })

  it('builds facial-hair color and opacity from normal and mask channels', () => {
    const result = bakeHairMaterial(texture([128, 128, 0, 64]), texture([0, 0, 0, 255]))!
    expect(Array.from(result.diffuse.rgba)).toEqual([184, 184, 184, 64])
    expect(Array.from(result.normal.rgba)).toEqual([128, 128, 255, 255])
  })

  it('builds face paint color and opacity from a CharacterTattoo normal texture', () => {
    const result = bakeTattooMaterial(texture([128, 128, 64, 96]))!
    expect(Array.from(result.diffuse.rgba)).toEqual([38, 112, 102, 96])
    expect(Array.from(result.normal.rgba)).toEqual([128, 128, 255, 255])
  })

  it('uses face-aware alpha modes for skin and hair overlays', () => {
    const face = '/mt_c0101f0001_etc_a.mtrl'
    expect(materialAlphaMode('hair.shpk', face)).toBe('blend')
    expect(materialAlphaMode('skin.shpk', face)).toBe('mask')
    expect(materialAlphaMode('skin.shpk', '/mt_c0101b0001_a.mtrl')).toBe('opaque')
  })

  it('does not apply the gear colorset baker to iris materials', () => {
    expect(usesCharacterColorTable('character.shpk')).toBe(true)
    expect(usesCharacterColorTable('characterstocking.shpk')).toBe(true)
    expect(usesCharacterColorTable('iris.shpk')).toBe(false)
    expect(usesCharacterColorTable('skin.shpk')).toBe(false)
  })
})
