import { describe, expect, it } from 'vitest'
import { decodeDyeCatalog, dyeCatalogUrl, dyeCssColor } from './stains'

describe('XIVAPI dye catalog', () => {
  it('requests the complete Stain sheet and sorts it by the game shade order', () => {
    const url = dyeCatalogUrl()
    expect(url.pathname).toBe('/api/sheet/Stain')
    expect(url.searchParams.get('fields')).toContain('IsMetallic')
    expect(url.searchParams.get('limit')).toBe('500')

    const result = decodeDyeCatalog({
      version: 'test',
      rows: [
        { row_id: 4, fields: { Name: 'Slate Grey', Color: 0x656565, Shade: 2, SubOrder: 5 } },
        { row_id: 2, fields: { Name: 'Ash Grey', Color: 0xaca8a2, Shade: 2, SubOrder: 3 } },
        { row_id: 0, fields: { Name: 'No Color', Color: 0, Shade: 2, SubOrder: 1 } },
      ],
    })
    expect(result.version).toBe('test')
    expect(result.dyes.map(({ id }) => id)).toEqual([0, 2, 4])
    expect(dyeCssColor(result.dyes[1]!.color)).toBe('#aca8a2')
  })

  it('rejects malformed or out-of-range stain rows', () => {
    expect(decodeDyeCatalog({ rows: [
      { row_id: 255, fields: { Name: 'Invalid', Color: 0, Shade: 1, SubOrder: 1 } },
      { row_id: 1, fields: { Name: '', Color: 0, Shade: 1, SubOrder: 1 } },
    ] }).dyes).toEqual([])
  })
})
