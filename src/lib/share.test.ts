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

  it('rejects invalid races, duplicate slots, and incomplete model metadata', () => {
    const valid = createSharedSet('c0201', equipped)
    const invalidRace = { ...valid, raceCode: 'c9999' } as unknown as SharedSet
    const duplicateSlots = { ...valid, items: [valid.items[0]!, valid.items[0]!] }
    const missingModel = { ...valid, items: [{ ...valid.items[0]!, modelSet: 0 }] }

    expect(parseSharedSet(`#/set/${encodeSharedSet(invalidRace)}`)).toBeNull()
    expect(parseSharedSet(`#/set/${encodeSharedSet(duplicateSlots)}`)).toBeNull()
    expect(parseSharedSet(`#/set/${encodeSharedSet(missingModel)}`)).toBeNull()
  })
})
