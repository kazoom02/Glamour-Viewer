import { describe, expect, it } from 'vitest'
import type { EquippedArmor } from '../catalog/types'
import {
  createSharedSet,
  encodeSharedSet,
  equippedFromSharedSet,
  parseSharedSet,
  sharedSetHash,
  type SharedSet,
} from './share'

const equipped: EquippedArmor = {
  mainHand: {
    id: 9012,
    name: 'Back-mounted blade',
    modelValue: 4_295_035_733,
    modelSet: 2901,
    modelBase: 1,
    modelVariant: 1,
    slot: 'mainHand',
    dyeCount: 0,
    equipLevel: 90,
    jobs: 'Gladiator',
    weaponPlacement: 'back',
  },
  head: {
    id: 1234,
    name: 'Étoile beret',
    iconPath: 'ui/icon/012000/012345_hr1.tex',
    modelValue: 131_262,
    modelSet: 190,
    modelBase: 0,
    modelVariant: 2,
    slot: 'head',
    dyeCount: 2,
    equipLevel: 90,
    jobs: 'All Classes',
    dyes: [
      { id: 4, name: 'Slate Grey', color: 0x656565 },
      { id: 2, name: 'Ash Grey', color: 0xaca8a2 },
    ],
    headHairVisibility: 'hide',
  },
  feet: {
    id: 5678,
    name: 'Expedition boots',
    modelValue: 65_726,
    modelSet: 190,
    modelBase: 0,
    modelVariant: 1,
    slot: 'feet',
    dyeCount: 1,
    equipLevel: 50,
    jobs: 'All Classes',
  },
}

describe('shared glamour recipes', () => {
  it('round-trips the actual race and equipment metadata through a URL hash', () => {
    const set = createSharedSet('c0501', equipped)
    const hash = sharedSetHash(set)

    expect(parseSharedSet(hash)).toEqual(set)
    expect(parseSharedSet(`https://viewer.example/${hash}`)).toEqual(set)
  })

  it('turns a parsed recipe back into equipped armor by slot', () => {
    const set = parseSharedSet(sharedSetHash(createSharedSet('c0201', equipped)))!
    expect(equippedFromSharedSet(set)).toEqual(equipped)
  })

  it('keeps older recipes without dye metadata valid', () => {
    const oldEquipment: EquippedArmor = { feet: equipped.feet }
    const parsed = parseSharedSet(sharedSetHash(createSharedSet('c0201', oldEquipment)))!
    expect(parsed.items[0]?.dyes).toBeUndefined()
  })

  it('rejects invalid races, duplicate slots, and incomplete model metadata', () => {
    const valid = createSharedSet('c0201', equipped)
    const invalidRace = { ...valid, raceCode: 'c9999' } as unknown as SharedSet
    const duplicateSlots = { ...valid, items: [valid.items[0]!, valid.items[0]!] }
    const missingModel = { ...valid, items: [{ ...valid.items[0]!, modelSet: 0 }] }
    const invalidDye = { ...valid, items: [{ ...valid.items[0]!, dyes: [{ id: 999, name: 'Invalid', color: 0 }] }] } as unknown as SharedSet
    const invalidHair = { ...valid, items: [{ ...valid.items[0]!, headHairVisibility: 'sometimes' }] } as unknown as SharedSet
    const feetHairOverride = { ...valid, items: valid.items.map((item) => item.slot === 'feet' ? { ...item, headHairVisibility: 'hide' } : item) } as unknown as SharedSet
    const invalidPlacement = { ...valid, items: valid.items.map((item) => item.slot === 'mainHand' ? { ...item, weaponPlacement: 'floating' } : item) } as unknown as SharedSet
    const feetPlacement = { ...valid, items: valid.items.map((item) => item.slot === 'feet' ? { ...item, weaponPlacement: 'back' } : item) } as unknown as SharedSet

    expect(parseSharedSet(`#/set/${encodeSharedSet(invalidRace)}`)).toBeNull()
    expect(parseSharedSet(`#/set/${encodeSharedSet(duplicateSlots)}`)).toBeNull()
    expect(parseSharedSet(`#/set/${encodeSharedSet(missingModel)}`)).toBeNull()
    expect(parseSharedSet(`#/set/${encodeSharedSet(invalidDye)}`)).toBeNull()
    expect(parseSharedSet(`#/set/${encodeSharedSet(invalidHair)}`)).toBeNull()
    expect(parseSharedSet(`#/set/${encodeSharedSet(feetHairOverride)}`)).toBeNull()
    expect(parseSharedSet(`#/set/${encodeSharedSet(invalidPlacement)}`)).toBeNull()
    expect(parseSharedSet(`#/set/${encodeSharedSet(feetPlacement)}`)).toBeNull()
  })
})
