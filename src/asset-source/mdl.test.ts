import { describe, expect, it } from 'vitest'
import { decodeMdl, reconstructMdl } from './mdl'

function triangleMdl(typeTerminator = false): ArrayBuffer {
  const buffer = new ArrayBuffer(526)
  const view = new DataView(buffer)
  const declarationOffset = 68
  const modelHeaderOffset = 212
  const lodOffset = modelHeaderOffset + 56
  const meshOffset = lodOffset + 180
  const vertexOffset = meshOffset + 36
  const indexOffset = vertexOffset + 36

  view.setUint16(12, 1, true)
  view.setUint32(16, vertexOffset, true)
  view.setUint32(28, indexOffset, true)
  view.setUint8(declarationOffset, 0)
  view.setUint8(declarationOffset + 1, 0)
  view.setUint8(declarationOffset + 2, 2) // float3
  view.setUint8(declarationOffset + 3, 0) // position
  if (typeTerminator) {
    view.setUint8(declarationOffset + 8, 0)
    view.setUint8(declarationOffset + 10, 17)
    view.setUint8(declarationOffset + 11, 3)
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
  view.setUint8(meshOffset + 32, 12)
  view.setUint8(meshOffset + 35, 1)

  const vertices = [0, 0, 0, 1, 0, 0, 0, 2, 0]
  vertices.forEach((value, index) => view.setFloat32(vertexOffset + index * 4, value, true))
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
  })

  it('treats Direct3D vertex type 17 as an unused declaration terminator', () => {
    const model = decodeMdl(triangleMdl(true))
    expect(model.meshes).toHaveLength(1)
    expect(model.meshes[0]!.normals).toBeUndefined()
  })

  it('splits meshes into IMC-addressable attribute submeshes', () => {
    const model = decodeMdl(attributedSubmeshMdl())
    expect(model.meshes).toHaveLength(2)
    expect(model.meshes.map((mesh) => mesh.attributes)).toEqual([['atr_tv_a'], ['atr_tv_b']])
    expect(model.meshes.map((mesh) => Array.from(mesh.indices))).toEqual([[0, 1, 2], [0, 2, 1]])
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
