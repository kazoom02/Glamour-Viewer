import { describe, expect, it } from 'vitest'
import { orderedAnimations, parsePapHeader, type PapAnimationInfo } from './pap'

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

describe('PAP animation selection', () => {
  const infos: PapAnimationInfo[] = [
    { name: 'cbbm_id0', havokIndex: 0 },
    { name: 'cbbm_01l_lp0', havokIndex: 1 },
    { name: 'cbbm_idle_loop', havokIndex: 2 },
  ]

  it('prefers the idle-ranked track when no name is requested', () => {
    const { infos: ordered, explicit } = orderedAnimations(infos)
    expect(explicit).toBe(false)
    // id0 outranks idle_loop, which outranks a non-idle track.
    expect(ordered.map((info) => info.name)).toEqual(['cbbm_id0', 'cbbm_idle_loop', 'cbbm_01l_lp0'])
  })

  it('promotes an explicitly named track and marks the pick explicit', () => {
    const { infos: ordered, explicit } = orderedAnimations(infos, 'cbbm_01l_lp0')
    expect(explicit).toBe(true)
    expect(ordered[0]!.name).toBe('cbbm_01l_lp0')
  })

  it('falls back to the ranked order when the requested name is absent', () => {
    const { explicit } = orderedAnimations(infos, 'does_not_exist')
    expect(explicit).toBe(false)
  })

  it('ignores tracks with no Havok binding', () => {
    const { infos: ordered } = orderedAnimations([...infos, { name: 'unbound', havokIndex: -1 }])
    expect(ordered.some((info) => info.name === 'unbound')).toBe(false)
  })
})

