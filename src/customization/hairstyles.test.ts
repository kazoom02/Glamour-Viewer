import { describe, expect, it } from 'vitest'
import { charaMakeTypeRow, hairstyleMenuUrl, hairstyleRowsUrl } from './hairstyles'

describe('hairstyle catalog', () => {
  it('maps every tribe and gender to the matching CharaMakeType row', () => {
    expect(charaMakeTypeRow(1, 'female')).toBe(0)
    expect(charaMakeTypeRow(1, 'male')).toBe(1)
    expect(charaMakeTypeRow(16, 'female')).toBe(30)
    expect(charaMakeTypeRow(16, 'male')).toBe(31)
  })

  it('requests only the hairstyle menu fields', () => {
    const url = hairstyleMenuUrl(7, 'male')
    expect(url.pathname).toBe('/api/sheet/CharaMakeType/13')
    expect(url.searchParams.get('fields')).toContain('CharaMakeStruct[].SubMenuParam')
  })

  it('batches referenced customization rows', () => {
    const url = hairstyleRowsUrl([131, 133, 144])
    expect(url.pathname).toBe('/api/sheet/CharaMakeCustomize')
    expect(url.searchParams.get('rows')).toBe('131,133,144')
    expect(url.searchParams.get('fields')).toBe('FeatureID,Icon,IsPurchasable')
  })
})
