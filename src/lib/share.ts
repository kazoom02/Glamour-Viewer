import { CHARACTER_PRESETS, type CharacterRaceCode } from '../asset-source/characterPlan'
import {
  ARMOR_SLOTS,
  isWeaponSlot,
  type ArmorItem,
  type EquipmentDye,
  type EquipmentSlot,
  type EquippedArmor,
  type HairVisibility,
  type WeaponPlacement,
} from '../catalog/types'

export interface SharedSet {
  version: 1
  name: string
  raceCode: CharacterRaceCode
  items: ArmorItem[]
}

const RACE_CODES = new Set<string>(CHARACTER_PRESETS.map(({ code }) => code))
const ARMOR_SLOT_SET = new Set<string>(ARMOR_SLOTS)
const HAIR_VISIBILITY = new Set<HairVisibility>(['auto', 'show', 'hide'])
const WEAPON_PLACEMENT = new Set<WeaponPlacement>(['hand', 'back'])

function toBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  bytes.forEach((byte) => (binary += String.fromCharCode(byte)))
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

function fromBase64Url(value: string): string {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
  const binary = atob(padded)
  return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)))
}

function integer(value: unknown, minimum = 0): number | undefined {
  return Number.isSafeInteger(value) && (value as number) >= minimum ? value as number : undefined
}

function decodeDye(value: unknown): EquipmentDye | null | false {
  if (value === null || value === undefined) return null
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<EquipmentDye>
  const id = integer(candidate.id, 1)
  const color = integer(candidate.color)
  if (id === undefined || id > 254 || color === undefined || color > 0xffffff || typeof candidate.name !== 'string' || !candidate.name.trim()) return false
  return { id, name: candidate.name.trim().slice(0, 100), color }
}

function decodeWeaponSubModel(value: unknown): ArmorItem['weaponSubModel'] | false {
  if (value === undefined) return undefined
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<{ set: number; base: number; variant: number }>
  const set = integer(candidate.set, 1)
  const base = integer(candidate.base)
  const variant = integer(candidate.variant)
  if (set === undefined || base === undefined || variant === undefined) return false
  return { set, base, variant }
}

function decodeSharedItem(value: unknown): ArmorItem | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<ArmorItem>
  if (
    integer(candidate.id, 1) === undefined
    || typeof candidate.name !== 'string'
    || !candidate.name.trim()
    || !ARMOR_SLOT_SET.has(candidate.slot ?? '')
    || integer(candidate.modelValue, 1) === undefined
    || integer(candidate.modelSet, 1) === undefined
    || integer(candidate.modelVariant) === undefined
  ) return null

  const dyeCount = integer(candidate.dyeCount) ?? 0
  let dyes: ArmorItem['dyes']
  if (candidate.dyes !== undefined) {
    if (!Array.isArray(candidate.dyes) || candidate.dyes.length > 2) return null
    const first = decodeDye(candidate.dyes[0])
    const second = decodeDye(candidate.dyes[1])
    if (first === false || second === false) return null
    dyes = [dyeCount > 0 ? first : null, dyeCount > 1 ? second : null]
  }
  const headHairVisibility = candidate.headHairVisibility
  if (headHairVisibility !== undefined && !HAIR_VISIBILITY.has(headHairVisibility)) return null
  if (headHairVisibility !== undefined && candidate.slot !== 'head') return null
  const weaponPlacement = candidate.weaponPlacement
  if (weaponPlacement !== undefined && !WEAPON_PLACEMENT.has(weaponPlacement)) return null
  if (weaponPlacement !== undefined && !isWeaponSlot(candidate.slot as EquipmentSlot)) return null
  const weaponSubModel = decodeWeaponSubModel(candidate.weaponSubModel)
  if (weaponSubModel === false) return null
  if (weaponSubModel && !isWeaponSlot(candidate.slot as EquipmentSlot)) return null

  return {
    id: candidate.id!,
    name: candidate.name.trim().slice(0, 200),
    iconPath: typeof candidate.iconPath === 'string' ? candidate.iconPath.slice(0, 500) : undefined,
    modelValue: candidate.modelValue!,
    modelSet: candidate.modelSet!,
    modelBase: integer(candidate.modelBase) ?? 0,
    modelVariant: candidate.modelVariant!,
    slot: candidate.slot as EquipmentSlot,
    dyeCount,
    equipLevel: integer(candidate.equipLevel) ?? 0,
    jobs: typeof candidate.jobs === 'string' ? candidate.jobs.slice(0, 500) : 'All classes',
    ...(dyes ? { dyes } : {}),
    ...(headHairVisibility ? { headHairVisibility } : {}),
    ...(weaponPlacement ? { weaponPlacement } : {}),
    ...(weaponSubModel ? { weaponSubModel } : {}),
  }
}

function hashFromInput(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) return ''
  try {
    if (/^https?:\/\//i.test(trimmed)) return new URL(trimmed).hash
  } catch {
    return ''
  }
  if (trimmed.startsWith('/#/')) return trimmed.slice(1)
  if (trimmed.startsWith('/set/')) return `#${trimmed}`
  if (trimmed.startsWith('set/')) return `#/${trimmed}`
  return trimmed
}

export function encodeSharedSet(set: SharedSet): string {
  return toBase64Url(JSON.stringify(set))
}

export function sharedSetHash(set: SharedSet): string {
  return `#/set/${encodeSharedSet(set)}`
}

export function createSharedSet(raceCode: CharacterRaceCode, equipped: EquippedArmor): SharedSet {
  return {
    version: 1,
    name: 'Shared glamour',
    raceCode,
    items: ARMOR_SLOTS.flatMap((slot) => equipped[slot] ? [equipped[slot]!] : []),
  }
}

export function equippedFromSharedSet(set: SharedSet): EquippedArmor {
  return Object.fromEntries(set.items.map((item) => [item.slot, item])) as EquippedArmor
}

export function parseSharedSet(input: string): SharedSet | null {
  let hash = hashFromInput(input)
  try {
    hash = decodeURIComponent(hash)
  } catch {
    return null
  }
  const match = hash.match(/^#\/set\/([A-Za-z0-9_-]+)\/?$/)
  if (!match?.[1]) return null

  try {
    const candidate = JSON.parse(fromBase64Url(match[1])) as Partial<SharedSet>
    if (
      candidate.version !== 1
      || typeof candidate.name !== 'string'
      || !RACE_CODES.has(candidate.raceCode ?? '')
      || !Array.isArray(candidate.items)
      || candidate.items.length > ARMOR_SLOTS.length
    ) return null
    const items = candidate.items.map(decodeSharedItem)
    if (items.some((item) => !item)) return null
    const slots = new Set(items.map((item) => item!.slot))
    if (slots.size !== items.length) return null

    return {
      version: 1,
      name: candidate.name.trim().slice(0, 100) || 'Shared glamour',
      raceCode: candidate.raceCode as CharacterRaceCode,
      items: items as ArmorItem[],
    }
  } catch {
    return null
  }
}

export function readSharedSet(hash = typeof window === 'undefined' ? '' : window.location.hash): SharedSet | null {
  return parseSharedSet(hash)
}
