import { describe, expect, it } from 'vitest'
import { cmpBustOffset, parseCmpBustScale } from './cmp'

describe('human.cmp bust scaling', () => {
  it('selects the correct clan entry and interpolates its three axes', () => {
    const offset = cmpBustOffset(7)
    const bytes = new ArrayBuffer(offset + 24)
    const view = new DataView(bytes)
    ;[0.8, 0.9, 1, 1.2, 1.3, 1.4].forEach((value, index) => view.setFloat32(offset + index * 4, value, true))

    const scale = parseCmpBustScale(bytes, 7, 50)
    expect(scale[0]).toBeCloseTo(1)
    expect(scale[1]).toBeCloseTo(1.1)
    expect(scale[2]).toBeCloseTo(1.2)
  })

  it('clamps the customization value to the authored minimum and maximum', () => {
    const offset = cmpBustOffset(1)
    const bytes = new ArrayBuffer(offset + 24)
    const view = new DataView(bytes)
    ;[0.7, 0.8, 0.9, 1.3, 1.4, 1.5].forEach((value, index) => view.setFloat32(offset + index * 4, value, true))

    expect(parseCmpBustScale(bytes, 1, -20)).toEqual(expect.arrayContaining([
      expect.closeTo(0.7), expect.closeTo(0.8), expect.closeTo(0.9),
    ]))
    expect(parseCmpBustScale(bytes, 1, 120)).toEqual(expect.arrayContaining([
      expect.closeTo(1.3), expect.closeTo(1.4), expect.closeTo(1.5),
    ]))
  })

  it('rejects invalid clans and truncated CMP data', () => {
    expect(() => cmpBustOffset(17)).toThrow('out of range')
    expect(() => parseCmpBustScale(new ArrayBuffer(16), 1, 50)).toThrow('truncated')
  })
})
