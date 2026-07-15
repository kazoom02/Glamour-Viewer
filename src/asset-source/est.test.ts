import { describe, expect, it } from 'vitest'
import { extraSkeletonId } from './est'

function fixture(): ArrayBuffer {
  const buffer = new ArrayBuffer(4 + 3 * 6)
  const view = new DataView(buffer)
  view.setUint32(0, 3, true)
  ;[[1, 101], [120, 201], [120, 601]].forEach(([set, race], index) => {
    view.setUint16(4 + index * 4, set!, true)
    view.setUint16(6 + index * 4, race!, true)
  })
  ;[0, 7, 12].forEach((skeleton, index) => view.setUint16(16 + index * 2, skeleton, true))
  return buffer
}

describe('EST extra-skeleton table', () => {
  it('matches both race and customization set', () => {
    expect(extraSkeletonId(fixture(), 201, 120)).toBe(7)
    expect(extraSkeletonId(fixture(), 601, 120)).toBe(12)
  })

  it('returns zero when no extra skeleton is assigned', () => {
    expect(extraSkeletonId(fixture(), 101, 1)).toBe(0)
    expect(extraSkeletonId(fixture(), 201, 1)).toBe(0)
  })

  it('rejects truncated tables', () => {
    expect(() => extraSkeletonId(new Uint8Array([4, 0, 0, 0]).buffer, 101, 1)).toThrow('truncated')
  })
})
