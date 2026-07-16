import { describe, expect, it } from 'vitest'
import type { DecodedModel } from '../asset-source/mdl'
import * as THREE from 'three'
import { applyBustDeformation, bustWeightSummary, isBustBoneName, muscleNormalStrength } from './bodyCustomization'

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

  it('bakes the weighted breast-bone scale into model positions', () => {
    const breast = new THREE.Bone()
    breast.name = 'j_mune_l'
    breast.updateMatrixWorld(true)
    const skeleton = new THREE.Skeleton([breast])
    skeleton.calculateInverses()
    breast.scale.set(2, 1, 1)
    breast.updateMatrixWorld(true)
    const model = {
      boneNames: ['j_mune_l'],
      meshes: [{
        positions: new Float32Array([1, 0, 0]),
        normals: new Float32Array([1, 0, 0]),
        indices: new Uint16Array([0]),
        materialIndex: 0,
        skinIndices: new Uint16Array([0, 0, 0, 0]),
        skinWeights: new Float32Array([1, 0, 0, 0]),
      }],
      materialPaths: [],
      bounds: { min: [0, 0, 0], max: [1, 0, 0] },
    } as DecodedModel

    const result = applyBustDeformation(model, skeleton, new Map([['j_mune_l', 0]]), [2, 1, 1])
    expect(model.meshes[0]!.positions[0]).toBeCloseTo(2)
    expect(result.weightedVertices).toBe(1)
    expect(result.maximumDisplacement).toBeCloseTo(1)
    expect(result.averageDisplacement).toEqual([1, 0, 0])
    expect(result.beforeBounds).toMatchObject({ min: [1, 0, 0], max: [1, 0, 0] })
    expect(result.afterBounds).toMatchObject({ min: [2, 0, 0], max: [2, 0, 0] })
    expect(result.maximumVertex).toMatchObject({
      meshIndex: 0,
      vertexIndex: 0,
      displacement: [1, 0, 0],
      bustWeight: 1,
      influences: ['j_mune_l@0:1.000000'],
    })
    expect(result.bones).toMatchObject([{
      name: 'j_mune_l',
      modelIndex: 0,
      rigIndex: 0,
      mapped: true,
      deltaScale: [2, 1, 1],
    }])
  })

  it('keeps CMP scale on model axes when the breast bone is rotated', () => {
    const breast = new THREE.Bone()
    breast.name = 'j_mune_l'
    breast.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2)
    breast.updateMatrixWorld(true)
    const skeleton = new THREE.Skeleton([breast])
    skeleton.calculateInverses()
    breast.scale.set(2, 1, 3)
    breast.updateMatrixWorld(true)
    const model = {
      boneNames: ['j_mune_l'],
      meshes: [{
        positions: new Float32Array([1, 0, 1]),
        normals: new Float32Array([Math.SQRT1_2, 0, Math.SQRT1_2]),
        indices: new Uint16Array([0]),
        materialIndex: 0,
        skinIndices: new Uint16Array([0, 0, 0, 0]),
        skinWeights: new Float32Array([1, 0, 0, 0]),
      }],
      materialPaths: [],
      bounds: { min: [1, 0, 1], max: [1, 0, 1] },
    } as DecodedModel

    const result = applyBustDeformation(model, skeleton, new Map([['j_mune_l', 0]]), [2, 1, 3])

    expect(Array.from(model.meshes[0]!.positions)).toEqual([2, 0, 3])
    expect(result.transformSpace).toBe('model-bind-axis')
    expect(result.bones[0]?.deltaScale).toEqual([2, 1, 3])
  })
})
