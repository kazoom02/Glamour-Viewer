import { describe, expect, it } from 'vitest'
import { bakeCharacterMaterial } from './materialBake'
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
      emissive: [0, 0, 0] as [number, number, number],
      roughness: 1,
      metalness: 0,
    }))
    rows[2]!.diffuse = [0.25, 0.25, 0.25]
    rows[3]!.diffuse = [1, 1, 1]
    const table: MaterialColorTable = { kind: 'dawntrail', rows }
    const result = bakeCharacterMaterial(table, {
      index: texture([17, 128, 0, 255]),
      diffuse: texture([255, 255, 255, 255]),
      mask: texture([255, 255, 255, 255]),
    })!
    expect(Array.from(result.diffuse.rgba.slice(0, 3))).toEqual([201, 201, 201])
  })
})
