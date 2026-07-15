import { describe, expect, it } from 'vitest'
import { armorSearchUrl, decodeEquipmentModel, xivapiIconUrl } from './xivapi'

describe('XIVAPI catalog helpers', () => {
  it('decodes an equipment model into set and variant identifiers', () => {
    expect(decodeEquipmentModel(65_726)).toEqual({ set: 190, base: 0, variant: 1 })
    expect(decodeEquipmentModel(4_295_035_733, 'mainHand')).toEqual({ set: 2901, base: 1, variant: 1 })
  })

  it('rejects unusable model values', () => {
    expect(decodeEquipmentModel(0)).toEqual({ set: 0, base: 0, variant: 0 })
    expect(decodeEquipmentModel(Number.NaN)).toEqual({ set: 0, base: 0, variant: 0 })
  })

  it('builds a direct XIVAPI image URL', () => {
    const url = new URL(xivapiIconUrl('ui/icon/040000/040175_hr1.tex'))
    expect(url.origin).toBe('https://v2.xivapi.com')
    expect(url.pathname).toBe('/api/asset')
    expect(url.searchParams.get('format')).toBe('webp')
    expect(url.searchParams.get('path')).toBe('ui/icon/040000/040175_hr1.tex')
  })

  it('builds a slot-only catalog query when the name is empty', () => {
    const url = armorSearchUrl('', 'head')
    expect(url.searchParams.get('limit')).toBe('50')
    expect(url.searchParams.get('query')).toBe('+EquipSlotCategory.Head>0')
  })

  it('combines a name search with the selected slot', () => {
    const url = armorSearchUrl('Ironworks', 'hands')
    expect(url.searchParams.get('query')).toBe('+Name~"Ironworks" +EquipSlotCategory.Gloves>0')
  })

  it('uses the current XIVAPI fields for accessories, rings, and weapons', () => {
    expect(armorSearchUrl('', 'ears').searchParams.get('query')).toBe('+EquipSlotCategory.Ears>0')
    expect(armorSearchUrl('', 'leftRing').searchParams.get('query')).toBe('+EquipSlotCategory.FingerL>0')
    expect(armorSearchUrl('', 'mainHand').searchParams.get('query')).toBe('+EquipSlotCategory.MainHand>0')
  })
})
