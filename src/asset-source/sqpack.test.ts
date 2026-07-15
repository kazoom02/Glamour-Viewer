import { describe, expect, it } from 'vitest'
import { jamcrc, locateIndex2Entry } from './sqpack'

describe('SqPack index2 lookup', () => {
  it('matches the JAMCRC reference vector', () => {
    expect(jamcrc(new Uint8Array([1, 1, 2, 4, 5, 6, 12, 12, 12]))).toBe(2_411_431_516)
  })

  it('resolves a hashed path into a dat file and bounded byte offset', () => {
    const path = 'chara/equipment/e0190/model/c0201e0190_top.mdl'
    const bytes = new Uint8Array(4096)
    bytes.set(new TextEncoder().encode('SqPack\0\0'))
    const view = new DataView(bytes.buffer)
    view.setUint32(12, 1024, true)
    view.setUint32(1032, 2048, true)
    view.setUint32(1036, 16, true)
    view.setUint32(2048, jamcrc(path), true)
    view.setUint32(2052, 0x804, true) // dat2, byte offset 0x4000
    view.setUint32(2056, 123, true)
    view.setUint32(2060, 0x1004, true) // dat2, byte offset 0x8000

    expect(locateIndex2Entry(bytes.buffer, path)).toEqual({
      dataFileId: 2,
      offset: 0x4000,
      nextOffset: 0x8000,
    })
  })
})
