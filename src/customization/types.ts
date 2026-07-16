import type { CharacterRaceCode } from '../asset-source/characterPlan'

export type CharacterGender = 'male' | 'female'

export interface TribePreset {
  id: number
  race: string
  tribe: string
  male: CharacterRaceCode
  female: CharacterRaceCode
}

/** All playable clans/tribes from the current FFXIV Race and Tribe sheets. */
export const TRIBE_PRESETS: readonly TribePreset[] = [
  { id: 1, race: 'Hyur', tribe: 'Midlander', male: 'c0101', female: 'c0201' },
  { id: 2, race: 'Hyur', tribe: 'Highlander', male: 'c0301', female: 'c0401' },
  { id: 3, race: 'Elezen', tribe: 'Wildwood', male: 'c0501', female: 'c0601' },
  { id: 4, race: 'Elezen', tribe: 'Duskwight', male: 'c0501', female: 'c0601' },
  { id: 5, race: 'Lalafell', tribe: 'Plainsfolk', male: 'c1101', female: 'c1201' },
  { id: 6, race: 'Lalafell', tribe: 'Dunesfolk', male: 'c1101', female: 'c1201' },
  { id: 7, race: "Miqo'te", tribe: 'Seeker of the Sun', male: 'c0701', female: 'c0801' },
  { id: 8, race: "Miqo'te", tribe: 'Keeper of the Moon', male: 'c0701', female: 'c0801' },
  { id: 9, race: 'Roegadyn', tribe: 'Sea Wolf', male: 'c0901', female: 'c1001' },
  { id: 10, race: 'Roegadyn', tribe: 'Hellsguard', male: 'c0901', female: 'c1001' },
  { id: 11, race: 'Au Ra', tribe: 'Raen', male: 'c1301', female: 'c1401' },
  { id: 12, race: 'Au Ra', tribe: 'Xaela', male: 'c1301', female: 'c1401' },
  { id: 13, race: 'Hrothgar', tribe: 'Helions', male: 'c1501', female: 'c1601' },
  { id: 14, race: 'Hrothgar', tribe: 'The Lost', male: 'c1501', female: 'c1601' },
  { id: 15, race: 'Viera', tribe: 'Rava', male: 'c1701', female: 'c1801' },
  { id: 16, race: 'Viera', tribe: 'Veena', male: 'c1701', female: 'c1801' },
] as const

export interface CharacterCustomization {
  tribeId: number
  gender: CharacterGender
  muscleTone: number
  bustSize: number
  face: number
  skinColor: string
  hairstyle: number
  hairColor: string
  jaw: number
  eyeShape: number
  irisSize: number
  eyeColor: string
  eyebrows: number
  nose: number
  mouth: number
  lipColor: string
  facialFeatures: number
  tattoos: number
  tattooColor: string
  facePaint: number
  facePaintColor: string
}

export const DEFAULT_CUSTOMIZATION: CharacterCustomization = {
  tribeId: 1,
  gender: 'female',
  muscleTone: 50,
  bustSize: 50,
  face: 1,
  skinColor: '#ffffff',
  hairstyle: 1,
  hairColor: '#ffffff',
  jaw: 1,
  eyeShape: 1,
  irisSize: 50,
  eyeColor: '#ffffff',
  eyebrows: 1,
  nose: 1,
  mouth: 1,
  lipColor: '#b66f72',
  facialFeatures: 0,
  tattoos: 0,
  tattooColor: '#6d4a42',
  facePaint: 0,
  facePaintColor: '#7f4f52',
}

export function raceCodeForCustomization(customization: Pick<CharacterCustomization, 'tribeId' | 'gender'>): CharacterRaceCode {
  const tribe = TRIBE_PRESETS.find(({ id }) => id === customization.tribeId) ?? TRIBE_PRESETS[0]!
  return tribe[customization.gender]
}

export function customizationForRaceCode(
  raceCode: CharacterRaceCode,
  current: CharacterCustomization = DEFAULT_CUSTOMIZATION,
): CharacterCustomization {
  const currentTribe = TRIBE_PRESETS.find(({ id }) => id === current.tribeId)
  const tribe = currentTribe && (currentTribe.male === raceCode || currentTribe.female === raceCode)
    ? currentTribe
    : TRIBE_PRESETS.find(({ male, female }) => male === raceCode || female === raceCode) ?? TRIBE_PRESETS[0]!
  return {
    ...current,
    tribeId: tribe.id,
    gender: tribe.female === raceCode ? 'female' : 'male',
  }
}
