import { describe, expect, it } from 'vitest'
import { readImcEntry } from './imc'

describe('IMC parser', () => {
  it('selects the requested equipment slot and variant', () => {
    const bytes = new Uint8Array(4 + 3 * 5 * 6)
    const view = new DataView(bytes.buffer)
    view.setUint16(0, 2, true)
    view.setUint16(2, 0b1_1111, true)
    const offset = 4 + (2 * 5 + 1) * 6
    bytes[offset] = 7
    bytes[offset + 1] = 3
    view.setUint16(offset + 2, 0x1234, true)
    bytes[offset + 4] = 5
    bytes[offset + 5] = 6

    expect(readImcEntry(bytes.buffer, 'body', 2)).toEqual({
      materialId: 7,
      decalId: 3,
      attributeAndSound: 0x1234,
      vfxId: 5,
      materialAnimationId: 6,
      attributeMask: 0x234,
      soundId: 4,
    })
  })

  it('uses the compact part index when earlier equipment slots are absent', () => {
    const bytes = new Uint8Array(4 + 2 * 6)
    const view = new DataView(bytes.buffer)
    view.setUint16(0, 0, true)
    view.setUint16(2, 0b1_0010, true) // body + feet
    bytes[4 + 6] = 9
    expect(readImcEntry(bytes.buffer, 'feet', 0).materialId).toBe(9)
  })

  it('maps both accessory ring sides to their distinct IMC parts', () => {
    const bytes = new Uint8Array(4 + 5 * 6)
    const view = new DataView(bytes.buffer)
    view.setUint16(0, 0, true)
    view.setUint16(2, 0b1_1111, true)
    bytes[4 + 3 * 6] = 8
    bytes[4 + 4 * 6] = 9
    expect(readImcEntry(bytes.buffer, 'rightRing', 0).materialId).toBe(8)
    expect(readImcEntry(bytes.buffer, 'leftRing', 0).materialId).toBe(9)
  })
})
