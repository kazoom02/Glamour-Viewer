export const ARMOR_SLOTS = ['head', 'body', 'hands', 'legs', 'feet'] as const

export type ArmorSlot = (typeof ARMOR_SLOTS)[number]

export interface ArmorItem {
  id: number
  name: string
  iconPath?: string
  modelValue: number
  modelSet: number
  modelVariant: number
  slot: ArmorSlot
  dyeCount: number
  equipLevel: number
  jobs: string
}

export interface ArmorSearchPage {
  items: ArmorItem[]
  next?: string
  version: string
}

export type EquippedArmor = Partial<Record<ArmorSlot, ArmorItem>>
