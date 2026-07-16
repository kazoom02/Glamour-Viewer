import { describe, expect, it } from 'vitest'
import { avfxChildren, avfxInt, avfxTexturePaths, decodeAvfx, evaluateAvfxCurve, parseAvfx, previewVfxTexturePaths } from './avfx'

describe('AVFX texture discovery', () => {
  it('extracts unique embedded ATEX paths and prioritizes visible effects', () => {
    const bytes = new TextEncoder().encode([
      'xxxxchara/weapon/w0001/vfx/texture/dist_001.atex\0',
      'chara/weapon/w0001/vfx/texture/glow001.atex\0',
      'chara/weapon/w0001/vfx/texture/glow001.atex\0',
    ].join('')).buffer
    const paths = avfxTexturePaths(bytes)
    expect(paths).toHaveLength(2)
    expect(previewVfxTexturePaths(paths, 1)).toEqual([
      'chara/weapon/w0001/vfx/texture/glow001.atex',
    ])
  })

  it('parses aligned reversed-fourCC node trees', () => {
    const bytes = new Uint8Array(28)
    bytes.set(new TextEncoder().encode('XFVA'), 0)
    new DataView(bytes.buffer).setInt32(4, 20, true)
    bytes.set(new Uint8Array([0, 0x72, 0x65, 0x56]), 8)
    new DataView(bytes.buffer).setInt32(12, 4, true)
    new DataView(bytes.buffer).setInt32(16, 7, true)
    bytes.set(new TextEncoder().encode('GSSb'), 20)
    new DataView(bytes.buffer).setInt32(24, 0, true)
    const root = parseAvfx(bytes.buffer)
    expect(root.tag).toBe('AVFX')
    expect(avfxInt(avfxChildren(root, 'Ver')[0])).toBe(7)
    expect(avfxChildren(root, 'bSSG')).toHaveLength(1)
  })

  it('evaluates linear, step, spline, repeat, and additive curve behavior', () => {
    const linear = {
      preBehavior: 0,
      postBehavior: 1,
      randomType: 0,
      keys: [
        { frame: 0, interpolation: 1 as const, outHandle: 1, inHandle: 1, value: 2 },
        { frame: 10, interpolation: 1 as const, outHandle: 1, inHandle: 1, value: 6 },
      ],
    }
    expect(evaluateAvfxCurve(linear, 5)).toBeCloseTo(4)
    expect(evaluateAvfxCurve(linear, 15)).toBeCloseTo(4)
    expect(evaluateAvfxCurve({ ...linear, postBehavior: 2 }, 15)).toBeCloseTo(8)
    expect(evaluateAvfxCurve({ ...linear, keys: [{ ...linear.keys[0]!, interpolation: 2 as const }, linear.keys[1]!] }, 5)).toBe(2)
    expect(evaluateAvfxCurve({ ...linear, keys: [{ ...linear.keys[0]!, interpolation: 0 as const }, linear.keys[1]!] }, 5)).toBeCloseTo(4, 2)
  })

  it('decodes direct texture nodes without scanning unrelated strings', () => {
    const encodeTag = (tag: string) => new TextEncoder().encode(tag.padEnd(4, '\0').split('').reverse().join(''))
    const node = (tag: string, data: Uint8Array) => {
      const result = new Uint8Array(8 + data.length + (4 - data.length % 4) % 4)
      result.set(encodeTag(tag))
      new DataView(result.buffer).setInt32(4, data.length, true)
      result.set(data, 8)
      return result
    }
    const version = new Uint8Array(4)
    new DataView(version.buffer).setInt32(0, 0x20110913, true)
    const children = [node('Ver', version), node('Tex', new TextEncoder().encode('chara/test/glow.atex\0'))]
    const size = children.reduce((sum, child) => sum + child.length, 0)
    const bytes = new Uint8Array(8 + size)
    bytes.set(encodeTag('AVFX'))
    new DataView(bytes.buffer).setInt32(4, size, true)
    let offset = 8
    for (const child of children) {
      bytes.set(child, offset)
      offset += child.length
    }
    const decoded = decodeAvfx(bytes.buffer)
    expect(decoded.version).toBe(0x20110913)
    expect(decoded.framesPerSecond).toBe(60)
    expect(decoded.textures).toEqual(['chara/test/glow.atex'])
  })
})
