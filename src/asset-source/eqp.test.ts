import { describe, expect, it } from 'vitest'
import { equipmentParameterEntry, headEquipmentVisibility } from './eqp'

function fixture(entry: bigint): ArrayBuffer {
  const buffer = new ArrayBuffer(160 * 8)
  const view = new DataView(buffer)
  view.setBigUint64(0, 1n, true) // Block zero is expanded; entry zero is the control word.
  view.setBigUint64(5 * 8, entry, true)
  return buffer
}

describe('equipment parameter hair visibility', () => {
  it('hides hair when the head Hide Hair bit is set', () => {
    expect(headEquipmentVisibility(fixture(1n << 42n), 5)).toEqual({
      hideScalp: false,
      hideHair: true,
      showHairOverride: false,
      hairHidden: true,
    })
  })

  it('lets Show Hair Override win over the hide bits', () => {
    const flags = (1n << 41n) | (1n << 42n) | (1n << 43n)
    expect(headEquipmentVisibility(fixture(flags), 5).hairHidden).toBe(false)
  })

  it('uses the client default for a collapsed block', () => {
    const buffer = new ArrayBuffer(8)
    expect(equipmentParameterEntry(buffer, 320)).toBe(0x3fe00070603f00n)
    expect(headEquipmentVisibility(buffer, 320).hairHidden).toBe(false)
  })

  it('rejects truncated expanded blocks', () => {
    const buffer = new ArrayBuffer(8)
    new DataView(buffer).setBigUint64(0, 1n, true)
    expect(() => equipmentParameterEntry(buffer, 5)).toThrow('truncated')
  })
})
