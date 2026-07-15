export const BODY_SLOTS = ['head', 'body', 'hands', 'legs', 'feet'] as const
export const ACCESSORY_SLOTS = ['ears', 'neck', 'wrists', 'rightRing', 'leftRing'] as const
export const WEAPON_SLOTS = ['mainHand', 'offHand'] as const
export const EQUIPMENT_SLOTS = [
  ...WEAPON_SLOTS,
  ...BODY_SLOTS,
  ...ACCESSORY_SLOTS,
] as const

/** Kept as an alias so existing shared recipes and callers remain compatible. */
export const ARMOR_SLOTS = EQUIPMENT_SLOTS

export type ArmorSlot = (typeof BODY_SLOTS)[number]
export type AccessorySlot = (typeof ACCESSORY_SLOTS)[number]
export type WeaponSlot = (typeof WEAPON_SLOTS)[number]
export type EquipmentSlot = (typeof EQUIPMENT_SLOTS)[number]

export const SLOT_LABELS: Record<EquipmentSlot, string> = {
  mainHand: 'Weapon',
  offHand: 'Off hand',
  head: 'Head',
  body: 'Body',
  hands: 'Hands',
  legs: 'Legs',
  feet: 'Feet',
  ears: 'Earrings',
  neck: 'Choker / necklace',
  wrists: 'Bracelets',
  rightRing: 'Right ring',
  leftRing: 'Left ring',
}

export function isWeaponSlot(slot: EquipmentSlot): slot is WeaponSlot {
  return slot === 'mainHand' || slot === 'offHand'
}

export function isAccessorySlot(slot: EquipmentSlot): slot is AccessorySlot {
  return (ACCESSORY_SLOTS as readonly string[]).includes(slot)
}

export function isBodySlot(slot: EquipmentSlot): slot is ArmorSlot {
  return (BODY_SLOTS as readonly string[]).includes(slot)
}

export interface ArmorItem {
  id: number
  name: string
  iconPath?: string
  modelValue: number
  modelSet: number
  /** Weapon body/model id. Zero for armor and accessories. */
  modelBase: number
  modelVariant: number
  slot: EquipmentSlot
  dyeCount: number
  equipLevel: number
  jobs: string
}

export interface ArmorSearchPage {
  items: ArmorItem[]
  next?: string
  version: string
}

export type EquippedArmor = Partial<Record<EquipmentSlot, ArmorItem>>
