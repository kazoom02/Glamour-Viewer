import { describe, expect, it } from 'vitest'
import { buildCustomizationCatalog, customizationMenuUrl, customizationRowsUrl } from './options'

describe('visual customization catalog', () => {
  it('requests the race and gender CharaMake menu fields', () => {
    const url = customizationMenuUrl(7, 'female')
    expect(url.pathname).toContain('/sheet/CharaMakeType/12')
    expect(url.searchParams.get('fields')).toContain('SubMenuGraphic')
  })

  it('deduplicates customization rows used by multiple menus', () => {
    const url = customizationRowsUrl([1050, 1051, 1050])
    expect(url.searchParams.get('rows')).toBe('1050,1051')
  })

  it('maps menu graphics to native shape values and FeatureID to face paint', () => {
    const catalog = buildCustomizationCatalog([
      { Customize: 18, SubMenuNum: 2, SubMenuGraphic: [0, 1], SubMenuParam: [1050, 1051] },
      { Customize: 15, SubMenuNum: 2, SubMenuGraphic: [0, 1], SubMenuParam: [1075, 1076] },
      { Customize: 24, SubMenuNum: 2, SubMenuGraphic: [0, 0], SubMenuParam: [2401, 2402] },
      { Customize: 12, SubMenuNum: 5 },
      { Customize: 12, SubMenuNum: 2 },
    ], [
      { row_id: 1050, fields: { FeatureID: 10, Icon: { path: 'jaw-1.tex' } } },
      { row_id: 1051, fields: { FeatureID: 11, Icon: { path: 'jaw-2.tex' } } },
      { row_id: 1075, fields: { FeatureID: 132 } },
      { row_id: 1076, fields: { FeatureID: 124 } },
      { row_id: 2401, fields: { FeatureID: 0 } },
      { row_id: 2402, fields: { FeatureID: 1, Icon: { path_hr1: 'paint-1.tex' } } },
    ])
    expect(catalog.options.jaw.map(({ value }) => value)).toEqual([0, 1])
    expect(catalog.options.irisSize.map(({ label }) => label)).toEqual(['Large', 'Small'])
    expect(catalog.options.facePaint.map(({ value }) => value)).toEqual([0, 1])
    expect(catalog.options.facePaint[1]?.iconPath).toBe('paint-1.tex')
    expect(catalog).toMatchObject({ facialFeatureCount: 5, tattooCount: 2 })
  })
})
