import { describe, expect, it } from 'vitest'
import { decodeMdl, reconstructMdl, selectSkinInfluences } from './mdl'

function triangleMdl(extendedWeights = false): ArrayBuffer {
  const vertexSize = extendedWeights ? 60 : 36
  const buffer = new ArrayBuffer(490 + vertexSize + 6)
  const view = new DataView(buffer)
  const declarationOffset = 68
  const modelHeaderOffset = 212
  const lodOffset = modelHeaderOffset + 56
  const meshOffset = lodOffset + 180
  const vertexOffset = meshOffset + 36
  const indexOffset = vertexOffset + vertexSize

  view.setUint16(12, 1, true)
  view.setUint32(16, vertexOffset, true)
  view.setUint32(28, indexOffset, true)
  view.setUint8(declarationOffset, 0)
  view.setUint8(declarationOffset + 1, 0)
  view.setUint8(declarationOffset + 2, 2) // float3
  view.setUint8(declarationOffset + 3, 0) // position
  if (extendedWeights) {
    view.setUint8(declarationOffset + 8, 0)
    view.setUint8(declarationOffset + 9, 12)
    view.setUint8(declarationOffset + 10, 17)
    view.setUint8(declarationOffset + 11, 1)
    view.setUint8(declarationOffset + 16, 0xff)
  } else {
    view.setUint8(declarationOffset + 8, 0xff)
  }
  view.setUint32(208, 0, true) // empty string table
  view.setUint16(modelHeaderOffset + 4, 1, true)
  view.setUint16(lodOffset, 0, true)
  view.setUint16(lodOffset + 2, 1, true)
  view.setUint16(meshOffset, 3, true)
  view.setUint32(meshOffset + 4, 3, true)
  view.setUint16(meshOffset + 8, 2, true)
  view.setUint32(meshOffset + 16, 0, true)
  view.setUint32(meshOffset + 20, 0, true)
  view.setUint8(meshOffset + 32, extendedWeights ? 20 : 12)
  view.setUint8(meshOffset + 35, 1)

  const vertices = [[0, 0, 0], [1, 0, 0], [0, 2, 0]]
  vertices.forEach((vertex, index) => {
    const start = vertexOffset + index * (extendedWeights ? 20 : 12)
    vertex.forEach((value, axis) => view.setFloat32(start + axis * 4, value, true))
    if (extendedWeights) view.setUint8(start + 12, 255)
  })
  ;[0, 1, 2].forEach((value, index) => view.setUint16(indexOffset + index * 2, value, true))
  return buffer
}

function texturedTriangleMdl(): ArrayBuffer {
  const modelHeaderOffset = 212
  const lodOffset = modelHeaderOffset + 56
  const meshOffset = lodOffset + 180
  const vertexOffset = meshOffset + 36
  const uvOffset = vertexOffset + 36
  const indexOffset = uvOffset + 12
  const buffer = new ArrayBuffer(indexOffset + 6)
  const view = new DataView(buffer)
  view.setUint16(12, 1, true)
  view.setUint32(16, vertexOffset, true)
  view.setUint32(28, indexOffset, true)
  view.setUint8(68, 0)
  view.setUint8(69, 0)
  view.setUint8(70, 2)
  view.setUint8(71, 0)
  view.setUint8(76, 1)
  view.setUint8(77, 0)
  view.setUint8(78, 13)
  view.setUint8(79, 4)
  view.setUint8(84, 0xff)
  view.setUint32(208, 0, true)
  view.setUint16(modelHeaderOffset + 4, 1, true)
  view.setUint16(lodOffset + 2, 1, true)
  view.setUint16(meshOffset, 3, true)
  view.setUint32(meshOffset + 4, 3, true)
  view.setUint32(meshOffset + 24, 36, true)
  view.setUint8(meshOffset + 32, 12)
  view.setUint8(meshOffset + 33, 4)
  view.setUint8(meshOffset + 35, 2)
  ;[0, 0, 0, 1, 0, 0, 0, 1, 0].forEach((value, index) => view.setFloat32(vertexOffset + index * 4, value, true))
  ;[0, 0, 0x3c00, 0, 0, 0x3c00].forEach((value, index) => view.setUint16(uvOffset + index * 2, value, true))
  ;[0, 1, 2].forEach((value, index) => view.setUint16(indexOffset + index * 2, value, true))
  return buffer
}

function packedUvTriangleMdl(): ArrayBuffer {
  const modelHeaderOffset = 212
  const lodOffset = modelHeaderOffset + 56
  const meshOffset = lodOffset + 180
  const vertexOffset = meshOffset + 36
  const uvOffset = vertexOffset + 36
  const indexOffset = uvOffset + 24
  const buffer = new ArrayBuffer(indexOffset + 6)
  const view = new DataView(buffer)
  view.setUint16(12, 1, true)
  view.setUint32(16, vertexOffset, true)
  view.setUint32(28, indexOffset, true)
  view.setUint8(68, 0)
  view.setUint8(69, 0)
  view.setUint8(70, 2)
  view.setUint8(71, 0)
  view.setUint8(76, 1)
  view.setUint8(77, 0)
  view.setUint8(78, 14)
  view.setUint8(79, 4)
  view.setUint8(84, 0xff)
  view.setUint32(208, 0, true)
  view.setUint16(modelHeaderOffset + 4, 1, true)
  view.setUint16(lodOffset + 2, 1, true)
  view.setUint16(meshOffset, 3, true)
  view.setUint32(meshOffset + 4, 3, true)
  view.setUint32(meshOffset + 24, 36, true)
  view.setUint8(meshOffset + 32, 12)
  view.setUint8(meshOffset + 33, 8)
  view.setUint8(meshOffset + 35, 2)
  ;[0, 0, 0, 1, 0, 0, 0, 1, 0].forEach((value, index) => view.setFloat32(vertexOffset + index * 4, value, true))
  ;[
    0, 0, 0x3400, 0x3800,
    0x3c00, 0, 0x3800, 0x3a00,
    0, 0x3c00, 0x3a00, 0x3c00,
  ].forEach((value, index) => view.setUint16(uvOffset + index * 2, value, true))
  ;[0, 1, 2].forEach((value, index) => view.setUint16(indexOffset + index * 2, value, true))
  return buffer
}

function attributedSubmeshMdl(): ArrayBuffer {
  const names = new TextEncoder().encode('atr_tv_a\0atr_tv_b\0')
  const modelHeaderOffset = 212 + names.length
  const lodOffset = modelHeaderOffset + 56
  const meshOffset = lodOffset + 180
  const attributeOffset = meshOffset + 36
  const submeshOffset = attributeOffset + 8
  const vertexOffset = submeshOffset + 32
  const indexOffset = vertexOffset + 36
  const buffer = new ArrayBuffer(indexOffset + 12)
  const view = new DataView(buffer)
  view.setUint16(12, 1, true)
  view.setUint32(16, vertexOffset, true)
  view.setUint32(28, indexOffset, true)
  view.setUint8(68, 0)
  view.setUint8(69, 0)
  view.setUint8(70, 2)
  view.setUint8(71, 0)
  view.setUint8(76, 0xff)
  view.setUint32(208, names.length, true)
  new Uint8Array(buffer, 212, names.length).set(names)
  view.setUint16(modelHeaderOffset + 4, 1, true)
  view.setUint16(modelHeaderOffset + 6, 2, true)
  view.setUint16(modelHeaderOffset + 8, 2, true)
  view.setUint16(lodOffset + 2, 1, true)
  view.setUint16(meshOffset, 3, true)
  view.setUint32(meshOffset + 4, 6, true)
  view.setUint16(meshOffset + 12, 2, true)
  view.setUint8(meshOffset + 32, 12)
  view.setUint8(meshOffset + 35, 1)
  view.setUint32(attributeOffset, 0, true)
  view.setUint32(attributeOffset + 4, 9, true)
  view.setUint32(submeshOffset + 4, 3, true)
  view.setUint32(submeshOffset + 8, 1, true)
  view.setUint32(submeshOffset + 16, 3, true)
  view.setUint32(submeshOffset + 20, 3, true)
  view.setUint32(submeshOffset + 24, 2, true)
  ;[0, 0, 0, 1, 0, 0, 0, 1, 0].forEach((value, index) => view.setFloat32(vertexOffset + index * 4, value, true))
  ;[0, 1, 2, 0, 2, 1].forEach((value, index) => view.setUint16(indexOffset + index * 2, value, true))
  return buffer
}

function shapedTriangleMdl(indexBase = 0): ArrayBuffer {
  const names = new TextEncoder().encode('shp_chk_a\0')
  const modelHeaderOffset = 212 + names.length
  const lodOffset = modelHeaderOffset + 56
  const meshOffset = lodOffset + 180
  const shapeOffset = meshOffset + 36
  const shapeMeshOffset = shapeOffset + 16
  const shapeValueOffset = shapeMeshOffset + 12
  const vertexOffset = shapeValueOffset + 4
  const indexOffset = vertexOffset + 48
  const buffer = new ArrayBuffer(indexOffset + (indexBase + 3) * 2)
  const view = new DataView(buffer)
  view.setUint16(12, 1, true)
  view.setUint32(16, vertexOffset, true)
  view.setUint32(28, indexOffset, true)
  view.setUint8(68, 0)
  view.setUint8(69, 0)
  view.setUint8(70, 2)
  view.setUint8(71, 0)
  view.setUint8(76, 0xff)
  view.setUint32(208, names.length, true)
  new Uint8Array(buffer, 212, names.length).set(names)
  view.setUint16(modelHeaderOffset + 4, 1, true)
  view.setUint16(modelHeaderOffset + 16, 1, true)
  view.setUint16(modelHeaderOffset + 18, 1, true)
  view.setUint16(modelHeaderOffset + 20, 1, true)
  view.setUint16(lodOffset + 2, 1, true)
  view.setUint16(meshOffset, 4, true)
  view.setUint32(meshOffset + 4, 3, true)
  view.setUint32(meshOffset + 16, indexBase, true)
  view.setUint8(meshOffset + 32, 12)
  view.setUint8(meshOffset + 35, 1)
  view.setUint32(shapeOffset, 0, true)
  view.setUint16(shapeOffset + 10, 1, true)
  view.setUint32(shapeMeshOffset, indexBase, true)
  view.setUint32(shapeMeshOffset + 4, 1, true)
  view.setUint16(shapeValueOffset, 0, true)
  view.setUint16(shapeValueOffset + 2, 3, true)
  ;[
    0, 0, 0,
    1, 0, 0,
    0, 1, 0,
    2, 0, 0,
  ].forEach((value, index) => view.setFloat32(vertexOffset + index * 4, value, true))
  ;[0, 1, 2].forEach((value, index) => view.setUint16(indexOffset + (indexBase + index) * 2, value, true))
  return buffer
}

describe('MDL geometry decoding', () => {
  it('extracts position and index buffers from a renderable LOD', () => {
    const model = decodeMdl(triangleMdl())
    expect(model.meshes).toHaveLength(1)
    expect(Array.from(model.meshes[0]!.positions)).toEqual([0, 0, 0, 1, 0, 0, 0, 2, 0])
    expect(Array.from(model.meshes[0]!.indices)).toEqual([0, 1, 2])
    expect(model.meshes[0]!.materialIndex).toBe(2)
    expect(model.materialPaths).toEqual([])
    expect(model.boneNames).toEqual([])
    expect(model.bounds).toEqual({ min: [0, 0, 0], max: [1, 2, 0] })
    expect(model.lod).toBe(0)
  })

  it('decodes extended type-17 blend weights without truncating the declaration', () => {
    const model = decodeMdl(triangleMdl(true))
    expect(model.meshes).toHaveLength(1)
    expect(Array.from(model.meshes[0]!.skinWeights!)).toEqual([
      1, 0, 0, 0,
      1, 0, 0, 0,
      1, 0, 0, 0,
    ])
  })

  it('decodes half-float UV vertex types used by character armor', () => {
    const model = decodeMdl(texturedTriangleMdl())
    expect(Array.from(model.meshes[0]!.uvs!)).toEqual([0, 0, 1, 0, 0, 1])
  })

  it('preserves both UV sets packed into a Half4 vertex attribute', () => {
    const model = decodeMdl(packedUvTriangleMdl())
    expect(Array.from(model.meshes[0]!.uvs!)).toEqual([0, 0, 1, 0, 0, 1])
    expect(Array.from(model.meshes[0]!.uvs2!)).toEqual([0.25, 0.5, 0.5, 0.75, 0.75, 1])
  })

  it('keeps the strongest four of eight paired skinning influences', () => {
    const selected = selectSkinInfluences(
      [10, 11, 12, 13, 14, 15, 16, 17],
      [0.01, 0.3, 0.02, 0.1, 0.25, 0.2, 0.05, 0.07],
    )
    expect(selected.indices).toEqual([11, 14, 15, 13])
    expect(selected.weights.reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(1)
  })

  it('splits meshes into IMC-addressable attribute submeshes', () => {
    const model = decodeMdl(attributedSubmeshMdl())
    expect(model.meshes).toHaveLength(2)
    expect(model.meshes.map((mesh) => mesh.attributes)).toEqual([['atr_tv_a'], ['atr_tv_b']])
    expect(model.meshes.map((mesh) => Array.from(mesh.indices))).toEqual([[0, 1, 2], [0, 2, 1]])
  })

  it('applies native MDL face shapes by replacing authored index entries', () => {
    const base = decodeMdl(shapedTriangleMdl())
    const shaped = decodeMdl(shapedTriangleMdl(), ['shp_chk_a'])
    expect(Array.from(base.meshes[0]!.indices)).toEqual([0, 1, 2])
    expect(Array.from(shaped.meshes[0]!.indices)).toEqual([3, 1, 2])
    expect(shaped.availableShapes).toEqual(['shp_chk_a'])
    expect(shaped.activeShapes).toEqual(['shp_chk_a'])
    expect(shaped.shapeReplacements).toBe(1)
  })

  it('keeps shape value offsets mesh-local when the mesh starts later in the shared index buffer', () => {
    const shaped = decodeMdl(shapedTriangleMdl(3), ['shp_chk_a'])
    expect(Array.from(shaped.meshes[0]!.indices)).toEqual([3, 1, 2])
    expect(shaped.shapeReplacements).toBe(1)
  })

  it('ignores SqPack alignment padding after a raw-deflate block', async () => {
    const headerSize = 210
    const onDiskSize = 32
    const payload = new ArrayBuffer(headerSize + onDiskSize)
    const view = new DataView(payload)
    view.setUint32(0, headerSize, true)
    view.setUint32(4, 3, true)
    view.setUint16(178, 1, true)
    view.setUint16(208, onDiskSize, true)

    const blockOffset = headerSize
    const compressed = Uint8Array.from([0xcb, 0x48, 0xcd, 0xc9, 0xc9, 0x07, 0x00]) // raw deflate for "hello"
    view.setUint32(blockOffset, 16, true)
    view.setUint32(blockOffset + 8, compressed.byteLength, true)
    view.setUint32(blockOffset + 12, 5, true)
    new Uint8Array(payload, blockOffset + 16, compressed.byteLength).set(compressed)
    new Uint8Array(payload, blockOffset + 16 + compressed.byteLength).fill(0xee)

    const mdl = new Uint8Array(await reconstructMdl(payload))
    expect(new TextDecoder().decode(mdl.slice(68))).toBe('hello')
  })
})
