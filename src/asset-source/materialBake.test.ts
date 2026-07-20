import { describe, expect, it } from 'vitest'
import {
  bakeCharacterMaterial,
  bakeHairMaterial,
  bakeIrisMaterial,
  bakeTattooMaterial,
  extractSkinColorMask,
  extractSkinLipMask,
  materialAlphaMode,
  materialAlphaCutoff,
  materialRendersBackfaces,
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
    // Colorset metalness now flows through (both selected rows are metal).
    expect(Array.from(result.metalness.rgba.slice(0, 3))).toEqual([255, 255, 255])
  })

  it('keeps cloth matte even when the mask red channel is bright', () => {
    // The regression: Dawntrail cloth carries a high mask red channel, which
    // was misread as metalness and made every garment render as polished metal.
    // Metalness must follow the colorset row (0 here), not the mask red channel.
    const rows = Array.from({ length: 32 }, () => ({
      diffuse: [0.5, 0.4, 0.3] as [number, number, number],
      specular: [0, 0, 0] as [number, number, number],
      specularMask: 1,
      emissive: [0, 0, 0] as [number, number, number],
      roughness: 1,
      metalness: 0,
    }))
    const result = bakeCharacterMaterial({ kind: 'dawntrail', rows }, {
      index: texture([0, 255, 0, 255]),
      diffuse: texture([255, 255, 255, 255]),
      mask: texture([255, 200, 128, 255]),
    }, 'character.shpk')!

    expect(Array.from(result.metalness.rgba.slice(0, 3))).toEqual([0, 0, 0])
  })

  it('turns a cloth row metallic when a dye raised its colorset metalness', () => {
    // Simulates the row a metallic dye produces: the colorset metalness is now
    // high, so the same garment reads as metal without any mask change.
    const rows = Array.from({ length: 32 }, () => ({
      diffuse: [0.5, 0.4, 0.3] as [number, number, number],
      specular: [0, 0, 0] as [number, number, number],
      specularMask: 1,
      emissive: [0, 0, 0] as [number, number, number],
      roughness: 1,
      metalness: 1,
    }))
    const result = bakeCharacterMaterial({ kind: 'dawntrail', rows }, {
      index: texture([0, 255, 0, 255]),
      diffuse: texture([255, 255, 255, 255]),
      mask: texture([0, 200, 128, 255]),
    }, 'character.shpk')!

    expect(Array.from(result.metalness.rgba.slice(0, 3))).toEqual([255, 255, 255])
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
    // Mask green 255 is full gloss, but the colorset/STM roughness remains the
    // baseline instead of being discarded by the texture.
    expect(Array.from(result.roughness.rgba.slice(0, 3))).toEqual([128, 128, 128])
    expect(result.specularIntensity.rgba[3]).toBe(16)
  })

  it('keeps the colorset roughness as the baseline for a Dawntrail material', () => {
    const rows = Array.from({ length: 32 }, () => ({
      diffuse: [1, 1, 1] as [number, number, number],
      specular: [0, 0, 0] as [number, number, number],
      specularMask: 1,
      emissive: [0, 0, 0] as [number, number, number],
      roughness: 1,
      metalness: 0,
    }))
    // A matte cloth: rough colorset row, near-white roughness mask.
    const result = bakeCharacterMaterial({ kind: 'dawntrail', rows }, {
      index: texture([0, 255, 0, 255]),
      mask: texture([255, 242, 255, 255]),
    }, 'character.shpk')!

    expect(result.roughness.rgba[0]).toBe(255)
  })

  it('does not let a smooth mask erase roughness supplied by a dye row', () => {
    const rows = Array.from({ length: 32 }, () => ({
      diffuse: [0.01, 0.01, 0.01] as [number, number, number],
      specular: [0.1, 0.2, 0.8] as [number, number, number],
      specularMask: 1,
      emissive: [0, 0, 0] as [number, number, number],
      roughness: 0.8,
      metalness: 0,
    }))
    const result = bakeCharacterMaterial({ kind: 'dawntrail', rows }, {
      index: texture([0, 255, 0, 255]),
      mask: texture([255, 16, 255, 255]),
    }, 'character.shpk')!

    expect(result.roughness.rgba[0]).toBe(204)
  })

  it('keeps a smooth roughness mask smooth', () => {
    const rows = Array.from({ length: 32 }, () => ({
      diffuse: [1, 1, 1] as [number, number, number],
      specular: [1, 1, 1] as [number, number, number],
      specularMask: 1,
      emissive: [0, 0, 0] as [number, number, number],
      roughness: 0.05,
      metalness: 0,
    }))
    // Low roughness (green 16) is a smooth surface.
    const result = bakeCharacterMaterial({ kind: 'dawntrail', rows }, {
      index: texture([0, 255, 0, 255]),
      mask: texture([255, 16, 255, 255]),
    }, 'character.shpk')!

    expect(result.roughness.rgba[0]).toBe(64) // 0.25 max
  })

  it('builds facial-hair color and opacity from normal and mask channels', () => {
    const result = bakeHairMaterial(texture([128, 128, 0, 64]), texture([0, 0, 0, 255]))!
    expect(Array.from(result.diffuse.rgba)).toEqual([184, 184, 184, 64])
    expect(Array.from(result.normal.rgba)).toEqual([128, 128, 255, 255])
  })

  it('keeps iris diffuse neutral for one runtime palette tint', () => {
    const diffuse = texture([180, 140, 100, 255])
    const result = bakeIrisMaterial(diffuse, texture([0, 0, 255, 255]))!
    expect(Array.from(result.rgba)).toEqual([180, 140, 100, 255])
    expect(result.rgba).not.toBe(diffuse.rgba)
  })

  it('extracts skin palette influence before cleaning the normal map', () => {
    expect(Array.from(extractSkinColorMask(texture([128, 128, 73, 201]))!.rgba)).toEqual([73, 73, 73, 255])
    expect(extractSkinColorMask({ ...texture([128, 128, 73, 201]), format: TEX_FORMAT.BC5 })).toBeUndefined()
  })

  it('builds face paint color and opacity from a CharacterTattoo normal texture', () => {
    const result = bakeTattooMaterial(texture([128, 128, 64, 96]))!
    expect(Array.from(result.diffuse.rgba)).toEqual([38, 112, 102, 96])
    expect(Array.from(result.normal.rgba)).toEqual([128, 128, 255, 255])
  })

  it('preserves the skin normal alpha channel as a grayscale lip mask', () => {
    const result = extractSkinLipMask(texture([120, 130, 90, 173]))!
    expect(Array.from(result.rgba)).toEqual([173, 173, 173, 255])
  })

  it('uses face-aware alpha modes for skin and hair overlays', () => {
    const face = '/mt_c0101f0001_etc_a.mtrl'
    expect(materialAlphaMode('hair.shpk', face)).toBe('blend')
    expect(materialAlphaMode('hair.shpk', '/mt_c0201h0014_hir_a.mtrl', 0x1d)).toBe('mask')
    expect(materialAlphaMode('skin.shpk', face)).toBe('mask')
    expect(materialAlphaMode('skin.shpk', '/mt_c0101b0001_a.mtrl')).toBe('opaque')
    expect(materialAlphaMode('character.shpk', '/mt_w2101b0062_a.mtrl', 0x10)).toBe('blend')
  })

  it('keeps open hair cards double-sided even when the authored flag hides generic backfaces', () => {
    expect(materialRendersBackfaces('hair.shpk', '/mt_c0201h0001_hir_a.mtrl', false, 'mask')).toBe(true)
    expect(materialRendersBackfaces('skin.shpk', '/mt_c0201f0001_fac_a.mtrl', false, 'opaque')).toBe(false)
  })

  it('uses the soft hair-card cutoff only for masked hair with a diffuse texture', () => {
    expect(materialAlphaCutoff('hair.shpk', 'mask', true)).toBe(0.15)
    expect(materialAlphaCutoff('hair.shpk', 'blend', true)).toBe(0)
    expect(materialAlphaCutoff('character.shpk', 'mask', true)).toBe(0.46)
  })

  it('does not apply the gear colorset baker to iris materials', () => {
    expect(usesCharacterColorTable('character.shpk')).toBe(true)
    expect(usesCharacterColorTable('characterstocking.shpk')).toBe(true)
    expect(usesCharacterColorTable('iris.shpk')).toBe(false)
    expect(usesCharacterColorTable('skin.shpk')).toBe(false)
  })
})
