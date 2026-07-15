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
