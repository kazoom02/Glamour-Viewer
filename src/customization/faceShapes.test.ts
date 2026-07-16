import { describe, expect, it } from 'vitest'
import { DEFAULT_CUSTOMIZATION } from './types'
import { activeFaceShapes, faceFeatureMask, faceFeatureVisible } from './faceShapes'

describe('native face customization mapping', () => {
  it('maps zero-based selector values to the corresponding MDL shapes', () => {
    expect(activeFaceShapes({
      ...DEFAULT_CUSTOMIZATION,
      eyebrows: 2,
      jaw: 1,
      eyeShape: 5,
      irisSize: 1,
      mouth: 3,
      nose: 4,
    })).toEqual(['shp_brw_b', 'shp_chk_a', 'shp_eye_e', 'shp_irs_a', 'shp_mth_c', 'shp_nse_d'])
  })

  it('combines feature and tattoo checkboxes into atr_fv_a-g visibility bits', () => {
    const mask = faceFeatureMask({ facialFeatures: 0b00101, tattoos: 0b10 })
    expect(mask).toBe(0b1000101)
    expect(faceFeatureVisible(['atr_fv_a'], mask)).toBe(true)
    expect(faceFeatureVisible(['atr_fv_b'], mask)).toBe(false)
    expect(faceFeatureVisible(['atr_fv_g'], mask)).toBe(true)
    expect(faceFeatureVisible(['atr_mim'], mask)).toBe(true)
  })
})
