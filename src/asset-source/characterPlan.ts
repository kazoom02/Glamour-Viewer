import { isWeaponSlot, type ArmorItem } from '../catalog/types'
import { equipmentAssetPlan } from './equipmentPlan'

export const CHARACTER_PRESETS = [
  { code: 'c0101', label: 'Hyur Midlander — Male' },
  { code: 'c0201', label: 'Hyur Midlander — Female' },
  { code: 'c0301', label: 'Hyur Highlander — Male' },
  { code: 'c0401', label: 'Hyur Highlander — Female' },
  { code: 'c0501', label: 'Elezen — Male' },
  { code: 'c0601', label: 'Elezen — Female' },
  { code: 'c0701', label: "Miqo'te — Male" },
  { code: 'c0801', label: "Miqo'te — Female" },
  { code: 'c0901', label: 'Roegadyn — Male' },
  { code: 'c1001', label: 'Roegadyn — Female' },
  { code: 'c1101', label: 'Lalafell — Male' },
  { code: 'c1201', label: 'Lalafell — Female' },
  { code: 'c1301', label: 'Au Ra — Male' },
  { code: 'c1401', label: 'Au Ra — Female' },
  { code: 'c1501', label: 'Hrothgar — Male' },
  { code: 'c1601', label: 'Hrothgar — Female' },
  { code: 'c1701', label: 'Viera — Male' },
  { code: 'c1801', label: 'Viera — Female' },
] as const

export type CharacterRaceCode = (typeof CHARACTER_PRESETS)[number]['code']
export type CharacterPart = 'torso' | 'hands' | 'legs' | 'feet' | 'face' | 'hair' | 'tail' | 'ears'

export interface CharacterModelPlan {
  part: CharacterPart
  path: string
  fallbackPaths?: string[]
  coveredBy?: 'body' | 'hands' | 'legs' | 'feet'
  optional?: boolean
}

export interface AuxiliarySkeletonPlan {
  part: 'tail' | 'ears'
  path: string
  attachmentBone: 'j_kosi' | 'j_kao'
}

const TAIL_RACES = new Set<CharacterRaceCode>(['c0701', 'c0801', 'c1301', 'c1401', 'c1501', 'c1601'])
const EAR_RACES = new Set<CharacterRaceCode>(['c1701', 'c1801'])

const EQUIPMENT_FALLBACKS: Record<CharacterRaceCode, readonly CharacterRaceCode[]> = {
  c0101: [],
  c0201: ['c0101'],
  c0301: ['c0101'],
  c0401: ['c0201', 'c0101'],
  c0501: ['c0101'],
  c0601: ['c0201', 'c0101'],
  c0701: ['c0101'],
  c0801: ['c0201', 'c0101'],
  c0901: ['c0101'],
  c1001: ['c0201', 'c0101'],
  c1101: ['c0101'],
  c1201: ['c1101', 'c0101'],
  c1301: ['c0101'],
  c1401: ['c0201', 'c0101'],
  c1501: ['c0901', 'c0101'],
  c1601: ['c1001', 'c0201', 'c0101'],
  c1701: ['c0101'],
  c1801: ['c0201', 'c0101'],
}

function modelPath(raceCode: CharacterRaceCode, category: string, prefix: string, suffix: string, id = '0001'): string {
  return `chara/human/${raceCode}/obj/${category}/${prefix}${id}/model/${raceCode}${prefix}${id}_${suffix}.mdl`
}

export function characterModelPlan(
  raceCode: CharacterRaceCode,
  options: { faceId?: number; hairId?: number } = {},
): CharacterModelPlan[] {
  const basePart = (
    part: 'torso' | 'hands' | 'legs' | 'feet',
    coveredBy: 'body' | 'hands' | 'legs' | 'feet',
    suffix: 'top' | 'glv' | 'dwn' | 'sho',
  ): CharacterModelPlan => {
    const paths = [raceCode, ...EQUIPMENT_FALLBACKS[raceCode]]
      .map((candidate) => `chara/equipment/e0000/model/${candidate}e0000_${suffix}.mdl`)
    return { part, coveredBy, path: paths[0]!, fallbackPaths: paths.slice(1) }
  }
  const faceId = Math.max(1, options.faceId ?? 1).toString().padStart(4, '0')
  const hairId = Math.max(1, options.hairId ?? 1).toString().padStart(4, '0')
  const facePaths = [...new Set([faceId, '0001', '0101'])].map((id) => modelPath(raceCode, 'face', 'f', 'fac', id))
  const hairPaths = [...new Set([hairId, '0001'])].map((id) => modelPath(raceCode, 'hair', 'h', 'hir', id))
  const result: CharacterModelPlan[] = [
    basePart('torso', 'body', 'top'),
    basePart('hands', 'hands', 'glv'),
    basePart('legs', 'legs', 'dwn'),
    basePart('feet', 'feet', 'sho'),
    { part: 'face', path: facePaths[0]!, fallbackPaths: facePaths.slice(1) },
    { part: 'hair', path: hairPaths[0]!, fallbackPaths: hairPaths.slice(1) },
  ]
  if (TAIL_RACES.has(raceCode)) result.push({ part: 'tail', path: modelPath(raceCode, 'tail', 't', 'til'), optional: true })
  if (EAR_RACES.has(raceCode)) result.push({ part: 'ears', path: modelPath(raceCode, 'zear', 'z', 'zer'), optional: true })
  return result
}

export function characterModelCandidates(plan: CharacterModelPlan): string[] {
  return [plan.path, ...(plan.fallbackPaths ?? [])]
}

export function skeletonPath(raceCode: CharacterRaceCode): string {
  return `chara/human/${raceCode}/skeleton/base/b0001/skl_${raceCode}b0001.sklb`
}

// FFXIV renders one weapon model at a size that depends on the wielder's race:
// the same greatsword is tiny on a Lalafell and huge on a Roegadyn. Weapon MDLs
// are authored for Hyur proportions, so those stay at 1.0 (no change to the
// current default) and the other races scale relative to their standing height.
// Applied to the weapon mesh and its VFX together; tune per race here alone.
const WEAPON_RACE_SCALE: Record<CharacterRaceCode, number> = {
  c0101: 1.00, c0201: 1.00, // Hyur Midlander (authoring reference)
  c0301: 1.08, c0401: 1.05, // Hyur Highlander
  c0501: 1.10, c0601: 1.06, // Elezen
  c0701: 1.00, c0801: 0.97, // Miqo'te
  c0901: 1.15, c1001: 1.10, // Roegadyn
  c1101: 0.62, c1201: 0.60, // Lalafell
  c1301: 1.04, c1401: 0.98, // Au Ra
  c1501: 1.14, c1601: 1.10, // Hrothgar
  c1701: 1.04, c1801: 1.03, // Viera
}

/** In-game weapon size multiplier for the wielder's race (Hyur = 1.0). */
export function weaponRaceScale(raceCode: CharacterRaceCode): number {
  return WEAPON_RACE_SCALE[raceCode] ?? 1
}

/** The selected race followed by the ancestor races whose animations it shares. */
export function raceAnimationFallbacks(raceCode: CharacterRaceCode): CharacterRaceCode[] {
  return [raceCode, ...EQUIPMENT_FALLBACKS[raceCode]]
}

/**
 * Resolves a `{weaponClass}/{sub}/{papFile}` animation reference to the in-game
 * `.pap` paths to try, newest race first. The game stores animations per race but
 * most fall back to a shared ancestor (ultimately Midlander `c0101`), mirroring how
 * equipment models resolve. See docs/local-sqpack.md for the SqPack read path.
 */
export function animationPapCandidates(
  raceCode: CharacterRaceCode,
  weaponClass: string,
  sub: string,
  papFile: string,
): string[] {
  return raceAnimationFallbacks(raceCode).map((candidate) => (
    `chara/human/${candidate}/animation/a0001/${weaponClass}/${sub}/${papFile}.pap`
  ))
}

/**
 * Race-authored standing idle loops for a weapon class, followed by compatible
 * skeleton fallbacks. When a weapon class ships no authored resident idle, the
 * unarmed `bt_common` idle is appended so a clip always resolves.
 */
export function idleAnimationCandidates(raceCode: CharacterRaceCode, weaponClass = 'bt_common'): string[] {
  const weaponIdle = animationPapCandidates(raceCode, weaponClass, 'resident', 'idle')
  if (weaponClass === 'bt_common') return weaponIdle
  return [...weaponIdle, ...animationPapCandidates(raceCode, 'bt_common', 'resident', 'idle')]
}

/** The common face skeleton remains the first candidate for backwards compatibility. */
export function faceSkeletonPath(raceCode: CharacterRaceCode): string {
  return faceSkeletonCandidates(raceCode)[0]!
}

/** Face extra-skeleton IDs vary by race family and are not always the face model ID. */
export function faceSkeletonCandidates(raceCode: CharacterRaceCode): string[] {
  const ids = raceCode === 'c0501'
    ? ['0001', '0002', '0101']
    : raceCode === 'c0301'
      ? ['0101', '0002', '0001']
      : ['0002', '0001', '0101']
  return ids.map((id) => `chara/human/${raceCode}/skeleton/face/f${id}/skl_${raceCode}f${id}.sklb`)
}

export function hairSkeletonPath(raceCode: CharacterRaceCode, skeletonId: number): string {
  const id = skeletonId.toString().padStart(4, '0')
  return `chara/human/${raceCode}/skeleton/hair/h${id}/skl_${raceCode}h${id}.sklb`
}

export function auxiliarySkeletonPlan(raceCode: CharacterRaceCode): AuxiliarySkeletonPlan[] {
  const result: AuxiliarySkeletonPlan[] = []
  if (TAIL_RACES.has(raceCode)) {
    result.push({
      part: 'tail',
      path: `chara/human/${raceCode}/skeleton/tail/t0001/skl_${raceCode}t0001.sklb`,
      attachmentBone: 'j_kosi',
    })
  }
  if (EAR_RACES.has(raceCode)) {
    result.push({
      part: 'ears',
      path: `chara/human/${raceCode}/skeleton/zear/z0001/skl_${raceCode}z0001.sklb`,
      attachmentBone: 'j_kao',
    })
  }
  return result
}

export function equipmentModelCandidates(item: ArmorItem, raceCode: CharacterRaceCode): string[] {
  if (isWeaponSlot(item.slot)) return [equipmentAssetPlan(item, raceCode).modelPath]
  // Older/shared sets can omit a race-specific model. Try a compatible body
  // family before the canonical male Midlander geometry.
  return [...new Set([raceCode, ...EQUIPMENT_FALLBACKS[raceCode]])]
    .map((candidate) => equipmentAssetPlan(item, candidate).modelPath)
}
