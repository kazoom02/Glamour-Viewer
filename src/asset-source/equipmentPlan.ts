import {
  isAccessorySlot,
  isWeaponSlot,
  type ArmorItem,
  type ArmorSlot,
  type AccessorySlot,
} from '../catalog/types'

const SLOT_SUFFIX: Record<ArmorSlot, string> = {
  head: 'met',
  body: 'top',
  hands: 'glv',
  legs: 'dwn',
  feet: 'sho',
}

const ACCESSORY_SUFFIX: Record<AccessorySlot, string> = {
  ears: 'ear',
  neck: 'nek',
  wrists: 'wrs',
  rightRing: 'rir',
  leftRing: 'ril',
}

export interface EquipmentAssetPlan {
  itemId: number
  raceCode: string
  setId: number
  baseId: number
  variant: number
  objectType: 'equipment' | 'accessory' | 'weapon'
  modelPath: string
  imcPath: string
  materialDirectory: string
}

function pad(value: number): string {
  return Math.max(0, value).toString().padStart(4, '0')
}

/** Weapon-local skeleton used by articulated arms such as Sage nouliths. */
export function weaponSkeletonPath(modelSet: number): string {
  const set = pad(modelSet)
  return `chara/weapon/w${set}/skeleton/base/b0001/skl_w${set}b0001.sklb`
}

export function equipmentAssetPlan(item: ArmorItem, raceCode = 'c0201'): EquipmentAssetPlan {
  if (!/^c\d{4}$/.test(raceCode)) throw new Error('Invalid FFXIV character race code.')
  const set = pad(item.modelSet)
  const base = pad(item.modelBase || 1)
  const variant = pad(item.modelVariant)
  if (isWeaponSlot(item.slot)) {
    return {
      itemId: item.id,
      raceCode,
      setId: item.modelSet,
      baseId: item.modelBase || 1,
      variant: item.modelVariant,
      objectType: 'weapon',
      modelPath: `chara/weapon/w${set}/obj/body/b${base}/model/w${set}b${base}.mdl`,
      imcPath: `chara/weapon/w${set}/obj/body/b${base}/b${base}.imc`,
      materialDirectory: `chara/weapon/w${set}/obj/body/b${base}/material/v${variant}/`,
    }
  }
  if (isAccessorySlot(item.slot)) {
    const suffix = ACCESSORY_SUFFIX[item.slot]
    return {
      itemId: item.id,
      raceCode,
      setId: item.modelSet,
      baseId: 0,
      variant: item.modelVariant,
      objectType: 'accessory',
      modelPath: `chara/accessory/a${set}/model/${raceCode}a${set}_${suffix}.mdl`,
      imcPath: `chara/accessory/a${set}/a${set}.imc`,
      materialDirectory: `chara/accessory/a${set}/material/v${variant}/`,
    }
  }
  const suffix = SLOT_SUFFIX[item.slot]
  return {
    itemId: item.id,
    raceCode,
    setId: item.modelSet,
    baseId: 0,
    variant: item.modelVariant,
    objectType: 'equipment',
    modelPath: `chara/equipment/e${set}/model/${raceCode}e${set}_${suffix}.mdl`,
    imcPath: `chara/equipment/e${set}/e${set}.imc`,
    materialDirectory: `chara/equipment/e${set}/material/v${variant}/`,
  }
}
