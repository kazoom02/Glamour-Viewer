import type { CharacterCustomization } from './types'

const LETTERS = 'abcdefghijklmnopqrstuvwxyz'

function shape(prefix: string, value: number): string | undefined {
  const index = Math.trunc(value) - 1
  return index >= 0 && index < LETTERS.length ? `shp_${prefix}_${LETTERS[index]}` : undefined
}

/** Maps the game's zero-based face selectors to the MDL index-replacement shapes. */
export function activeFaceShapes(customization: CharacterCustomization): string[] {
  return [
    shape('brw', customization.eyebrows),
    shape('chk', customization.jaw),
    shape('eye', customization.eyeShape),
    customization.irisSize > 0 ? 'shp_irs_a' : undefined,
    shape('mth', customization.mouth),
    shape('nse', customization.nose),
  ].filter((value): value is string => Boolean(value))
}

/** Facial Features and Tattoos share the seven atr_fv_a-g submesh bits. */
export function faceFeatureMask(customization: Pick<CharacterCustomization, 'facialFeatures' | 'tattoos'>): number {
  return (customization.facialFeatures & 0x1f) | ((customization.tattoos & 0x03) << 5)
}

export function faceFeatureVisible(attributes: string[] | undefined, mask: number): boolean {
  const featureAttributes = attributes?.map((value) => value.toLowerCase()).filter((value) => /^atr_fv_[a-g]$/.test(value)) ?? []
  if (!featureAttributes.length) return true
  return featureAttributes.some((attribute) => (mask & (1 << (attribute.charCodeAt(attribute.length - 1) - 97))) !== 0)
}
