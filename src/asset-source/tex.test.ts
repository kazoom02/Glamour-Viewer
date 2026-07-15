import { describe, expect, it } from 'vitest'
import { decodeTex, TEX_FORMAT } from './tex'

function compressedTex(format: number, blockBytes: number): ArrayBuffer {
  const bytes = new Uint8Array(80 + blockBytes)
  const view = new DataView(bytes.buffer)
  view.setUint32(4, format, true)
  view.setUint16(8, 4, true)
  view.setUint16(10, 4, true)
  view.setUint16(12, 1, true)
  bytes[14] = 1
  bytes[15] = 1
  view.setUint32(28, 80, true)
  return bytes.buffer
}

describe('TEX decoder', () => {
  it.each([
    ['BC1', TEX_FORMAT.BC1, 8],
    ['BC3', TEX_FORMAT.BC3, 16],
    ['BC5', TEX_FORMAT.BC5, 16],
    ['BC7', TEX_FORMAT.BC7, 16],
  ] as const)('decodes %s blocks to RGBA', (_name, format, blockBytes) => {
    const texture = decodeTex(compressedTex(format, blockBytes))
    expect(texture.width).toBe(4)
    expect(texture.height).toBe(4)
    expect(texture.rgba).toHaveLength(64)
  })

  it('converts BGRA pixels into RGBA', () => {
    const bytes = new Uint8Array(84)
    const view = new DataView(bytes.buffer)
    view.setUint32(4, TEX_FORMAT.B8G8R8A8, true)
    view.setUint16(8, 1, true)
    view.setUint16(10, 1, true)
    bytes[14] = 1
    bytes[15] = 1
    view.setUint32(28, 80, true)
    bytes.set([10, 20, 30, 40], 80)
    expect([...decodeTex(bytes.buffer).rgba]).toEqual([30, 20, 10, 40])
  })
})

