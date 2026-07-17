import { isWeaponSlot, type ArmorItem, type ArmorSearchPage, type EquipmentSlot } from './types'

const DEFAULT_XIVAPI_BASE_URL = 'https://v2.xivapi.com/api/'
const SLOT_FIELDS: Record<EquipmentSlot, keyof EquipSlotFields> = {
  mainHand: 'MainHand',
  offHand: 'OffHand',
  head: 'Head',
  body: 'Body',
  hands: 'Gloves',
  legs: 'Legs',
  feet: 'Feet',
  ears: 'Ears',
  neck: 'Neck',
  wrists: 'Wrists',
  rightRing: 'FingerR',
  leftRing: 'FingerL',
}
const FIELDS = [
  'Name',
  'Icon',
  'ModelMain',
  'ModelSub',
  'EquipSlotCategory',
  'DyeCount',
  'LevelEquip',
  'LevelItem.value',
  'ClassJobCategory.value',
  'ClassJobCategory.Name',
].join(',')

interface Relationship<T> {
  value?: number
  fields?: T
}

interface EquipSlotFields {
  MainHand?: number
  OffHand?: number
  Head?: number
  Body?: number
  Gloves?: number
  Legs?: number
  Feet?: number
  Ears?: number
  Neck?: number
  Wrists?: number
  FingerR?: number
  FingerL?: number
}

interface SearchFields {
  Name?: string
  Icon?: { path?: string; path_hr1?: string }
  ModelMain?: number
  ModelSub?: number
  EquipSlotCategory?: Relationship<EquipSlotFields>
  DyeCount?: number
  LevelEquip?: number
  LevelItem?: Relationship<Record<string, never>>
  ClassJobCategory?: Relationship<{ Name?: string }>
}

interface SearchResponse {
  next?: string
  version?: string
  results?: Array<{ row_id?: number; fields?: SearchFields }>
}

const PAGE_SIZE = 50

function apiBaseUrl(): URL {
  const configured = import.meta.env.VITE_XIVAPI_BASE_URL || DEFAULT_XIVAPI_BASE_URL
  const url = new URL(configured)
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('VITE_XIVAPI_BASE_URL must be an http(s) URL.')
  if (!url.pathname.endsWith('/')) url.pathname += '/'
  return url
}

/** Builds a URL against the configured XIVAPI v2 API root. */
export function xivapiApiUrl(path: string): URL {
  return new URL(path.replace(/^\/+/, ''), apiBaseUrl())
}

function escapeQueryValue(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')
}

export function decodeEquipmentModel(
  modelValue: number,
  slot: EquipmentSlot = 'body',
): { set: number; base: number; variant: number } {
  if (!Number.isSafeInteger(modelValue) || modelValue <= 0) return { set: 0, base: 0, variant: 0 }
  const set = modelValue % 65_536
  const middle = Math.floor(modelValue / 65_536) % 65_536
  if (isWeaponSlot(slot)) {
    return {
      set,
      base: middle,
      variant: Math.floor(modelValue / 4_294_967_296) % 256,
    }
  }
  return {
    set,
    base: 0,
    variant: middle,
  }
}

export function xivapiIconUrl(path: string): string {
  const url = xivapiApiUrl('asset')
  url.searchParams.set('path', path)
  url.searchParams.set('format', 'webp')
  return url.toString()
}

export function armorSearchUrl(search: string, slot: EquipmentSlot): URL {
  const term = search.trim()
  if (term.length === 1) throw new Error('Enter at least two characters, or leave the search empty to browse everything.')

  const url = new URL('search', apiBaseUrl())
  url.searchParams.set('sheets', 'Item')
  url.searchParams.set('fields', FIELDS)
  url.searchParams.set('limit', PAGE_SIZE.toString())
  const clauses = [`+EquipSlotCategory.${SLOT_FIELDS[slot]}>0`]
  if (term) clauses.unshift(`+Name~"${escapeQueryValue(term)}"`)
  url.searchParams.set('query', clauses.join(' '))
  return url
}

function cursorUrl(cursor: string): URL {
  const url = new URL('search', apiBaseUrl())
  url.searchParams.set('fields', FIELDS)
  url.searchParams.set('limit', PAGE_SIZE.toString())
  url.searchParams.set('cursor', cursor)
  return url
}

async function fetchArmorPage(url: URL, selectedSlot: EquipmentSlot, signal?: AbortSignal): Promise<ArmorSearchPage> {

  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    mode: 'cors',
    signal,
  })
  if (!response.ok) throw new Error(`XIVAPI returned HTTP ${response.status}.`)

  const payload = (await response.json()) as SearchResponse
  const items = (payload.results ?? []).flatMap<ArmorItem>((result) => {
    const fields = result.fields
    const id = result.row_id
    const slotFields = fields?.EquipSlotCategory?.fields
    if ((slotFields?.[SLOT_FIELDS[selectedSlot]] ?? 0) <= 0) return []
    const modelValue = fields?.ModelMain || fields?.ModelSub
    if (!fields?.Name || id === undefined || !modelValue) return []

    const model = decodeEquipmentModel(modelValue, selectedSlot)
    if (!model.set) return []
    return [{
      id,
      name: fields.Name,
      iconPath: fields.Icon?.path_hr1 ?? fields.Icon?.path,
      modelValue,
      modelSet: model.set,
      modelBase: model.base,
      modelVariant: model.variant,
      slot: selectedSlot,
      dyeCount: fields.DyeCount ?? 0,
      equipLevel: fields.LevelEquip ?? 0,
      itemLevel: fields.LevelItem?.value ?? 0,
      jobs: fields.ClassJobCategory?.fields?.Name ?? 'All classes',
      classJobCategoryId: fields.ClassJobCategory?.value ?? 0,
    }]
  })

  return {
    items,
    next: payload.next,
    version: payload.version ?? 'latest',
  }
}

export function searchArmor(search: string, slot: EquipmentSlot, signal?: AbortSignal): Promise<ArmorSearchPage> {
  return fetchArmorPage(armorSearchUrl(search, slot), slot, signal)
}

export function continueArmorSearch(cursor: string, slot: EquipmentSlot, signal?: AbortSignal): Promise<ArmorSearchPage> {
  if (!cursor) throw new Error('The XIVAPI catalog cursor is empty.')
  return fetchArmorPage(cursorUrl(cursor), slot, signal)
}

/**
 * A selectable class/job filter. `columns` lists the ClassJobCategory boolean
 * columns that mean "this job may equip the item" — a job plus its base class,
 * since e.g. a Paladin can wear Gladiator gear.
 */
export interface JobFilter {
  code: string
  label: string
  group: string
  columns: string[]
}

export const JOB_FILTERS: JobFilter[] = [
  { code: 'PLD', label: 'Paladin', group: 'Tank', columns: ['PLD', 'GLA'] },
  { code: 'WAR', label: 'Warrior', group: 'Tank', columns: ['WAR', 'MRD'] },
  { code: 'DRK', label: 'Dark Knight', group: 'Tank', columns: ['DRK'] },
  { code: 'GNB', label: 'Gunbreaker', group: 'Tank', columns: ['GNB'] },
  { code: 'WHM', label: 'White Mage', group: 'Healer', columns: ['WHM', 'CNJ'] },
  { code: 'SCH', label: 'Scholar', group: 'Healer', columns: ['SCH', 'ACN'] },
  { code: 'AST', label: 'Astrologian', group: 'Healer', columns: ['AST'] },
  { code: 'SGE', label: 'Sage', group: 'Healer', columns: ['SGE'] },
  { code: 'MNK', label: 'Monk', group: 'Melee', columns: ['MNK', 'PGL'] },
  { code: 'DRG', label: 'Dragoon', group: 'Melee', columns: ['DRG', 'LNC'] },
  { code: 'NIN', label: 'Ninja', group: 'Melee', columns: ['NIN', 'ROG'] },
  { code: 'SAM', label: 'Samurai', group: 'Melee', columns: ['SAM'] },
  { code: 'RPR', label: 'Reaper', group: 'Melee', columns: ['RPR'] },
  { code: 'VPR', label: 'Viper', group: 'Melee', columns: ['VPR'] },
  { code: 'BRD', label: 'Bard', group: 'Ranged', columns: ['BRD', 'ARC'] },
  { code: 'MCH', label: 'Machinist', group: 'Ranged', columns: ['MCH'] },
  { code: 'DNC', label: 'Dancer', group: 'Ranged', columns: ['DNC'] },
  { code: 'BLM', label: 'Black Mage', group: 'Caster', columns: ['BLM', 'THM'] },
  { code: 'SMN', label: 'Summoner', group: 'Caster', columns: ['SMN', 'ACN'] },
  { code: 'RDM', label: 'Red Mage', group: 'Caster', columns: ['RDM'] },
  { code: 'PCT', label: 'Pictomancer', group: 'Caster', columns: ['PCT'] },
  { code: 'BLU', label: 'Blue Mage', group: 'Caster', columns: ['BLU'] },
  { code: 'CRP', label: 'Carpenter', group: 'Crafter', columns: ['CRP'] },
  { code: 'BSM', label: 'Blacksmith', group: 'Crafter', columns: ['BSM'] },
  { code: 'ARM', label: 'Armorer', group: 'Crafter', columns: ['ARM'] },
  { code: 'GSM', label: 'Goldsmith', group: 'Crafter', columns: ['GSM'] },
  { code: 'LTW', label: 'Leatherworker', group: 'Crafter', columns: ['LTW'] },
  { code: 'WVR', label: 'Weaver', group: 'Crafter', columns: ['WVR'] },
  { code: 'ALC', label: 'Alchemist', group: 'Crafter', columns: ['ALC'] },
  { code: 'CUL', label: 'Culinarian', group: 'Crafter', columns: ['CUL'] },
  { code: 'MIN', label: 'Miner', group: 'Gatherer', columns: ['MIN'] },
  { code: 'BTN', label: 'Botanist', group: 'Gatherer', columns: ['BTN'] },
  { code: 'FSH', label: 'Fisher', group: 'Gatherer', columns: ['FSH'] },
]

/** Every ClassJobCategory column referenced by a JobFilter, plus Name. */
const CLASS_JOB_COLUMNS = [...new Set(JOB_FILTERS.flatMap((job) => job.columns))]

type ClassJobCategoryRow = { row_id?: number; fields?: Record<string, boolean | string> }

/**
 * Loads the ClassJobCategory sheet once and returns a map from category id to the
 * set of job columns that are enabled for it, so an item's class compatibility can
 * be resolved from just its ClassJobCategory id.
 */
export async function fetchClassJobCategories(signal?: AbortSignal): Promise<Map<number, Set<string>>> {
  const url = new URL('sheet/ClassJobCategory', apiBaseUrl())
  url.searchParams.set('limit', '400')
  url.searchParams.set('fields', ['Name', ...CLASS_JOB_COLUMNS].join(','))
  const response = await fetch(url, { headers: { Accept: 'application/json' }, mode: 'cors', signal })
  if (!response.ok) throw new Error(`XIVAPI returned HTTP ${response.status} for ClassJobCategory.`)
  const payload = (await response.json()) as { rows?: ClassJobCategoryRow[] }
  const map = new Map<number, Set<string>>()
  for (const row of payload.rows ?? []) {
    if (row.row_id === undefined) continue
    const enabled = new Set<string>()
    for (const column of CLASS_JOB_COLUMNS) {
      if (row.fields?.[column] === true) enabled.add(column)
    }
    map.set(row.row_id, enabled)
  }
  return map
}
