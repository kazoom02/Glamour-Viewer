import { describe, expect, it } from 'vitest'
import {
  charaMakeTypeRow,
  hairstyleBlockRows,
  hairstyleMenuUrl,
  hairstyleOptions,
  hairstyleRowsUrl,
} from './hairstyles'

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

  it('expands the race menu to its complete 130-row compatibility block', () => {
    const rows = hairstyleBlockRows([521, 522, 529])
    expect(rows).toHaveLength(130)
    expect(rows[0]).toBe(521)
    expect(rows.at(-1)).toBe(650)
  })

  it('merges unlockable hairstyles omitted from the default creation menu', () => {
    const options = hairstyleOptions([1, 3], [
      { row_id: 1, fields: { FeatureID: 1, Icon: { path: 'default.tex' }, IsPurchasable: false } },
      { row_id: 2, fields: { FeatureID: 2, Icon: { path: 'unrelated.tex' }, IsPurchasable: false } },
      { row_id: 3, fields: { FeatureID: 3, Icon: { path: 'default-3.tex' }, IsPurchasable: false } },
      { row_id: 65, fields: { FeatureID: 157, Icon: { path: 'unlockable.tex' }, IsPurchasable: true } },
    ])

    expect(options.map(({ customizeId, hairId }) => ({ customizeId, hairId }))).toEqual([
      { customizeId: 1, hairId: 1 },
      { customizeId: 3, hairId: 3 },
      { customizeId: 65, hairId: 157 },
    ])
  })
})
