import { describe, expect, it } from 'vitest'
import { createLocalAssetReader, jamcrc, locateIndex2Entry } from './sqpack'

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

  it('reconstructs a standard file from bounded DAT blocks', async () => {
    const path = 'chara/equipment/e0001/e0001.imc'
    const indexBytes = new Uint8Array(4096)
    indexBytes.set(new TextEncoder().encode('SqPack\0\0'))
    const indexView = new DataView(indexBytes.buffer)
    indexView.setUint32(12, 1024, true)
    indexView.setUint32(1032, 2048, true)
    indexView.setUint32(1036, 8, true)
    indexView.setUint32(2048, jamcrc(path), true)
    indexView.setUint32(2052, 0x400, true) // dat0, byte offset 0x2000

    const datBytes = new Uint8Array(0x2040)
    const datView = new DataView(datBytes.buffer)
    datView.setUint32(0x2000, 32, true)
    datView.setUint32(0x2004, 2, true)
    datView.setUint32(0x2008, 4, true)
    datView.setUint32(0x2014, 1, true)
    datView.setUint32(0x2020, 16, true)
    datView.setUint32(0x2028, 32_000, true)
    datView.setUint32(0x202c, 4, true)
    datBytes.set([1, 2, 3, 4], 0x2030)

    const index = new File([indexBytes], '040000.win32.index2')
    const dat = new File([datBytes], '040000.win32.dat0')
    Object.defineProperty(index, 'webkitRelativePath', { value: 'sqpack/ffxiv/040000.win32.index2' })
    Object.defineProperty(dat, 'webkitRelativePath', { value: 'sqpack/ffxiv/040000.win32.dat0' })
    const reader = createLocalAssetReader({
      kind: 'local', label: 'fixture', access: 'fallback', files: [index, dat],
    })
    expect([...new Uint8Array(await reader.read(path))]).toEqual([1, 2, 3, 4])
  })

  it('reconstructs a streamed TEX header and surface block', async () => {
    const path = 'chara/test/texture/test_d.tex'
    const indexBytes = new Uint8Array(4096)
    indexBytes.set(new TextEncoder().encode('SqPack\0\0'))
    const indexView = new DataView(indexBytes.buffer)
    indexView.setUint32(12, 1024, true)
    indexView.setUint32(1032, 2048, true)
    indexView.setUint32(1036, 8, true)
    indexView.setUint32(2048, jamcrc(path), true)
    indexView.setUint32(2052, 0x400, true)

    const datBytes = new Uint8Array(0x20a0)
    const datView = new DataView(datBytes.buffer)
    datView.setUint32(0x2000, 48, true)
    datView.setUint32(0x2004, 4, true)
    datView.setUint32(0x2008, 88, true)
    datView.setUint32(0x2014, 1, true)
    datView.setUint32(0x2018, 80, true)
    datView.setUint32(0x2028, 1, true)
    datView.setUint16(0x202c, 24, true)
    const base = 0x2030
    datView.setUint32(base + 4, 0x3420, true)
    datView.setUint16(base + 8, 4, true)
    datView.setUint16(base + 10, 4, true)
    datView.setUint32(base + 28, 80, true)
    datView.setUint32(base + 80, 16, true)
    datView.setUint32(base + 88, 32_000, true)
    datView.setUint32(base + 92, 8, true)
    datBytes.set([1, 2, 3, 4, 5, 6, 7, 8], base + 96)

    const index = new File([indexBytes], '040000.win32.index2')
    const dat = new File([datBytes], '040000.win32.dat0')
    Object.defineProperty(index, 'webkitRelativePath', { value: 'sqpack/ffxiv/040000.win32.index2' })
    Object.defineProperty(dat, 'webkitRelativePath', { value: 'sqpack/ffxiv/040000.win32.dat0' })
    const output = new Uint8Array(await createLocalAssetReader({
      kind: 'local', label: 'fixture', access: 'fallback', files: [index, dat],
    }).read(path))
    expect(output).toHaveLength(88)
    expect([...output.slice(80)]).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })
})
