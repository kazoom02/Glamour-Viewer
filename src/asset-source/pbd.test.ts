import { describe, expect, it } from 'vitest'
import type { DecodedModel } from './mdl'
import { decodePbd, deformModel, deformationChain, modelRaceCode } from './pbd'
import type { DecodedSkeleton } from './sklb'

function testPbd(matrix = [
  1, 0, 0, 0,
  0, 1, 0, 2,
  0, 0, 1, 0,
]): ArrayBuffer {
  const rootRace = 101
  const targetRace = 501
  const entryCount = 2
  const headerEnd = 4 + entryCount * 12
  const treeEnd = headerEnd + entryCount * 8
  const name = new TextEncoder().encode('j_root\0')
  const deformerSize = 4 + 2 + 2 + 48 + name.length
  const buffer = new ArrayBuffer(treeEnd + deformerSize)
  const view = new DataView(buffer)
  view.setInt32(0, entryCount, true)

  view.setUint16(4, rootRace, true)
  view.setUint16(6, 0, true)
  view.setInt32(8, 0, true)
  view.setFloat32(12, 1, true)
  view.setUint16(16, targetRace, true)
  view.setUint16(18, 1, true)
  view.setInt32(20, treeEnd, true)
  view.setFloat32(24, 1, true)

  view.setInt16(headerEnd, -1, true)
  view.setInt16(headerEnd + 6, 0, true)
  view.setInt16(headerEnd + 8, 0, true)
  view.setInt16(headerEnd + 14, 1, true)

  view.setInt32(treeEnd, 1, true)
  const stringOffset = 4 + 2 + 2 + 48
  view.setUint16(treeEnd + 4, stringOffset, true)
  matrix.forEach((value, index) => view.setFloat32(treeEnd + 8 + index * 4, value, true))
  new Uint8Array(buffer, treeEnd + stringOffset, name.length).set(name)
  return buffer
}

const skeleton: DecodedSkeleton = {
  bones: [
    { name: 'j_root', parentIndex: -1, translation: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
    { name: 'j_kao', parentIndex: 0, translation: [0, 1, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
  ],
}

describe('human.pbd racial deformation', () => {
  it('decodes the race tree, bone names, and row-major matrices', () => {
    const pbd = decodePbd(testPbd())
    const chain = deformationChain(pbd, 101, 501)
    expect(chain).toHaveLength(1)
    expect(chain[0]?.parentRaceCode).toBe(101)
    expect(Array.from(chain[0]!.matrices.get('j_root')!)).toEqual([
      1, 0, 0, 0,
      0, 1, 0, 2,
      0, 0, 1, 0,
    ])
  })

  it('deforms shared geometry once using skin weights and inherited parent-bone transforms', () => {
    const positions = new Float32Array([1, 1, 1])
    const skinIndices = new Uint16Array([0, 0, 0, 0])
    const skinWeights = new Float32Array([1, 0, 0, 0])
    const model: DecodedModel = {
      boneNames: ['j_kao'],
      materialPaths: [],
      bounds: { min: [1, 1, 1], max: [1, 1, 1] },
      meshes: [
        { positions, skinIndices, skinWeights, indices: new Uint16Array([0]), materialIndex: 0 },
        { positions, skinIndices, skinWeights, indices: new Uint16Array([0]), materialIndex: 0 },
      ],
    }

    deformModel(model, decodePbd(testPbd()), skeleton, 101, 501)

    expect(Array.from(positions)).toEqual([1, 3, 1])
    expect(model.bounds).toEqual({ min: [1, 3, 1], max: [1, 3, 1] })
    expect(model.deformation).toEqual({ sourceRaceCode: 101, targetRaceCode: 501, steps: 1, matrixBones: 1, vertices: 1, normals: 0 })
  })

  it('uses inverse-transpose matrices for normals under non-uniform racial scaling', () => {
    const positions = new Float32Array([1, 1, 0])
    const normals = new Float32Array([Math.SQRT1_2, Math.SQRT1_2, 0])
    const model: DecodedModel = {
      boneNames: ['j_root'],
      materialPaths: [],
      bounds: { min: [1, 1, 0], max: [1, 1, 0] },
      meshes: [{
        positions,
        normals,
        skinIndices: new Uint16Array([0, 0, 0, 0]),
        skinWeights: new Float32Array([1, 0, 0, 0]),
        indices: new Uint16Array([0]),
        materialIndex: 0,
      }],
    }
    const scale = [
      2, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 0.5, 0,
    ]

    deformModel(model, decodePbd(testPbd(scale)), skeleton, 101, 501)

    expect(Array.from(positions)).toEqual([2, 1, 0])
    expect(normals[0]).toBeCloseTo(1 / Math.sqrt(5))
    expect(normals[1]).toBeCloseTo(2 / Math.sqrt(5))
    expect(normals[2]).toBeCloseTo(0)
    expect(model.deformation?.normals).toBe(1)
  })

  it('extracts the authored race code from character and equipment model paths', () => {
    expect(modelRaceCode('chara/equipment/e0000/model/c0101e0000_top.mdl')).toBe(101)
    expect(modelRaceCode('chara/human/c0501/obj/face/f0001/model/c0501f0001_fac.mdl')).toBe(501)
    expect(modelRaceCode('chara/common/texture/skin_mask.tex')).toBeUndefined()
  })
})
