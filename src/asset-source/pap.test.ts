import { describe, expect, it } from 'vitest'
import { parsePapHeader } from './pap'

function papFixture(): ArrayBuffer {
  const bytes = new Uint8Array(74)
  const view = new DataView(bytes.buffer)
  bytes.set(new TextEncoder().encode('pap '), 0)
  view.setInt32(4, 0x00020001, true)
  view.setInt16(8, 1, true)
  view.setUint32(10, 101, true)
  view.setInt32(14, 26, true)
  view.setInt32(18, 66, true)
  view.setInt32(22, 74, true)
  bytes.set(new TextEncoder().encode('cbnm_idle_loop'), 26)
  view.setInt16(60, 3, true)
  view.setUint32(66, 0xcab00d1e, true)
  view.setUint32(70, 0xd011face, true)
  return bytes.buffer
}

describe('PAP decoder', () => {
  it('reads animation names, binding indices and the Havok range', () => {
    const parsed = parsePapHeader(papFixture())
    expect(parsed.animations).toEqual([{ name: 'cbnm_idle_loop', havokIndex: 3 }])
    expect(Array.from(parsed.havokData)).toEqual([0x1e, 0x0d, 0xb0, 0xca, 0xce, 0xfa, 0x11, 0xd0])
  })

  it('rejects non-PAP data', () => {
    expect(() => parsePapHeader(new ArrayBuffer(32))).toThrow('PAP magic')
  })
})

