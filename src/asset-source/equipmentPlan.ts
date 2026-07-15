import type { ArmorItem, ArmorSlot } from '../catalog/types'

const SLOT_SUFFIX: Record<ArmorSlot, string> = {
  head: 'met',
  body: 'top',
  hands: 'glv',
  legs: 'dwn',
  feet: 'sho',
}

export interface EquipmentAssetPlan {
  itemId: number
  raceCode: string
  setId: number
  variant: number
  modelPath: string
  imcPath: string
  materialDirectory: string
}

function pad(value: number): string {
  return Math.max(0, value).toString().padStart(4, '0')
}

export function equipmentAssetPlan(item: ArmorItem, raceCode = 'c0201'): EquipmentAssetPlan {
  if (!/^c\d{4}$/.test(raceCode)) throw new Error('Invalid FFXIV character race code.')
  const set = pad(item.modelSet)
  const variant = pad(item.modelVariant)
  const suffix = SLOT_SUFFIX[item.slot]
  return {
    itemId: item.id,
    raceCode,
    setId: item.modelSet,
    variant: item.modelVariant,
    modelPath: `chara/equipment/e${set}/model/${raceCode}e${set}_${suffix}.mdl`,
    imcPath: `chara/equipment/e${set}/e${set}.imc`,
    materialDirectory: `chara/equipment/e${set}/material/v${variant}/`,
  }
}
