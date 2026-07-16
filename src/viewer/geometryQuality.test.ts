import { describe, expect, it } from 'vitest'
import type { DecodedModelMesh } from '../asset-source/mdl'
import { subdivideCurvedMesh } from './geometryQuality'

describe('curvature-aware geometry refinement', () => {
  it('splits one triangle into four while preserving attributes and skinning', () => {
    const root = Math.SQRT1_2
    const mesh: DecodedModelMesh = {
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      normals: new Float32Array([0, 0, 1, root, 0, root, 0, root, root]),
      uvs: new Float32Array([0, 0, 1, 0, 0, 1]),
      skinIndices: new Uint16Array([1, 0, 0, 0, 2, 0, 0, 0, 3, 0, 0, 0]),
      skinWeights: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]),
      indices: new Uint16Array([0, 1, 2]),
      materialIndex: 0,
    }

    const refined = subdivideCurvedMesh(mesh)

    expect(refined.indices).toHaveLength(12)
    expect(refined.positions).toHaveLength(18)
    expect(Array.from(refined.positions.slice(0, 9))).toEqual(Array.from(mesh.positions))
    expect(refined.positions[11]).toBeGreaterThan(0)
    expect(Array.from(refined.uvs!.slice(6, 8))).toEqual([0.5, 0])
    const midpointWeights = Array.from(refined.skinWeights!.slice(12, 16))
    expect(midpointWeights.reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(1)
    expect(new Set(refined.skinIndices!.slice(12, 16))).toEqual(new Set([0, 1, 2]))
  })

  it('leaves unsupported or empty geometry untouched', () => {
    const mesh: DecodedModelMesh = {
      positions: new Float32Array(),
      indices: new Uint16Array(),
      materialIndex: 0,
    }
    expect(subdivideCurvedMesh(mesh)).toBe(mesh)
  })
})
