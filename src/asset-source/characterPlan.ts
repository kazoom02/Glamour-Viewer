import type { ArmorItem } from '../catalog/types'
import { equipmentAssetPlan } from './equipmentPlan'

export const CHARACTER_PRESETS = [
  ['c0101', 'Midlander male'], ['c0201', 'Midlander female'],
  ['c0901', 'Roegadyn male'],
] as const

export type CharacterRaceCode = (typeof CHARACTER_PRESETS)[number][0]
export type CharacterPart = 'torso' | 'hands' | 'legs' | 'feet' | 'face' | 'iris' | 'hair' | 'tail' | 'ears'

export interface CharacterModelPlan {
  part: CharacterPart
  path: string
  coveredBy?: 'body' | 'hands' | 'legs' | 'feet'
}

function modelPath(raceCode: CharacterRaceCode, category: string, prefix: string, suffix: string): string {
  return `chara/human/${raceCode}/obj/${category}/${prefix}0001/model/${raceCode}${prefix}0001_${suffix}.mdl`
}

export function characterModelPlan(raceCode: CharacterRaceCode): CharacterModelPlan[] {
  const result: CharacterModelPlan[] = [
    { part: 'torso', coveredBy: 'body', path: `chara/equipment/e0000/model/${raceCode}e0000_top.mdl` },
    { part: 'hands', coveredBy: 'hands', path: `chara/equipment/e0000/model/${raceCode}e0000_glv.mdl` },
    { part: 'legs', coveredBy: 'legs', path: `chara/equipment/e0000/model/${raceCode}e0000_dwn.mdl` },
    { part: 'feet', coveredBy: 'feet', path: `chara/equipment/e0000/model/${raceCode}e0000_sho.mdl` },
    { part: 'face', path: modelPath(raceCode, 'face', 'f', 'fac') },
    // Iris geometry is a separate customization model; it is not part of _fac.mdl.
    { part: 'iris', path: modelPath(raceCode, 'face', 'f', 'iri') },
    { part: 'hair', path: modelPath(raceCode, 'hair', 'h', 'hir') },
  ]
  return result
}

export function skeletonPath(raceCode: CharacterRaceCode): string {
  return `chara/human/${raceCode}/skeleton/base/b0001/skl_${raceCode}b0001.sklb`
}

/** The currently supported human presets use the shared f0002 auxiliary skeleton. */
export function faceSkeletonPath(raceCode: CharacterRaceCode): string {
  const id = '0002'
  return `chara/human/${raceCode}/skeleton/face/f${id}/skl_${raceCode}f${id}.sklb`
}

export function hairSkeletonPath(raceCode: CharacterRaceCode, hairId = 1): string {
  const id = hairId.toString().padStart(4, '0')
  return `chara/human/${raceCode}/skeleton/hair/h${id}/skl_${raceCode}h${id}.sklb`
}

export function equipmentModelCandidates(item: ArmorItem, raceCode: CharacterRaceCode): string[] {
  const fallback: CharacterRaceCode = raceCode === 'c0201' ? 'c0201' : 'c0101'
  return [...new Set([equipmentAssetPlan(item, raceCode).modelPath, equipmentAssetPlan(item, fallback).modelPath])]
}
