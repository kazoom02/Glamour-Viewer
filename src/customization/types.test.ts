import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CUSTOMIZATION,
  TRIBE_PRESETS,
  customizationForRaceCode,
  raceCodeForCustomization,
} from './types'

describe('character customization presets', () => {
  it('contains every playable tribe and both genders', () => {
    expect(TRIBE_PRESETS).toHaveLength(16)
    expect(new Set(TRIBE_PRESETS.map(({ race }) => race)).size).toBe(8)
    expect(new Set(TRIBE_PRESETS.flatMap(({ male, female }) => [male, female])).size).toBe(18)
  })

  it('maps tribe and gender choices to the correct character model', () => {
    expect(raceCodeForCustomization({ tribeId: 12, gender: 'female' })).toBe('c1401')
    expect(raceCodeForCustomization({ tribeId: 16, gender: 'male' })).toBe('c1701')
    expect(customizationForRaceCode('c1601', DEFAULT_CUSTOMIZATION)).toMatchObject({ tribeId: 13, gender: 'female' })
  })
})
