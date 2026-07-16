import { describe, expect, it } from 'vitest'
import type { DecodedModel } from '../asset-source/mdl'
import { bustWeightSummary, isBustBoneName, muscleNormalStrength } from './bodyCustomization'

describe('body customization rendering', () => {
  it('recognizes vanilla breast bones case-insensitively', () => {
    expect(isBustBoneName('j_mune_l')).toBe(true)
    expect(isBustBoneName('J_MUNE_R')).toBe(true)
    expect(isBustBoneName('j_sebo_c')).toBe(false)
  })

  it('maps muscle tone to a visible but bounded normal strength', () => {
    expect(muscleNormalStrength(0)).toBeCloseTo(0.35)
    expect(muscleNormalStrength(50)).toBeCloseTo(0.925)
    expect(muscleNormalStrength(100)).toBeCloseTo(1.5)
    expect(muscleNormalStrength(999)).toBeCloseTo(1.5)
  })

  it('counts vertices carrying breast-bone weights', () => {
    const model = {
      boneNames: ['n_root', 'j_mune_l', 'j_mune_r'],
      meshes: [{
        positions: new Float32Array(6),
        indices: new Uint16Array([0, 1, 1]),
        materialIndex: 0,
        skinIndices: new Uint16Array([1, 0, 0, 0, 2, 0, 0, 0]),
        skinWeights: new Float32Array([0.75, 0.25, 0, 0, 0.5, 0.5, 0, 0]),
      }],
      materialPaths: [],
      bounds: { min: [0, 0, 0], max: [0, 0, 0] },
    } as DecodedModel

    expect(bustWeightSummary(model)).toMatchObject({
      modelBones: ['j_mune_l@1', 'j_mune_r@2'],
      weightedVertices: 2,
      totalWeight: 1.25,
      maximumWeight: 0.75,
    })
  })
})
