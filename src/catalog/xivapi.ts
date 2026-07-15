import type { ArmorItem, ArmorSearchPage, ArmorSlot } from './types'

const DEFAULT_XIVAPI_BASE_URL = 'https://v2.xivapi.com/api/'
const ARMOR_SLOT_QUERY = [
  'EquipSlotCategory.Head>0',
  'EquipSlotCategory.Body>0',
  'EquipSlotCategory.Gloves>0',
  'EquipSlotCategory.Legs>0',
  'EquipSlotCategory.Feet>0',
].join(' ')
const FIELDS = [
  'Name',
  'Icon',
  'ModelMain',
  'EquipSlotCategory',
  'DyeCount',
  'LevelEquip',
  'ClassJobCategory.Name',
].join(',')

interface Relationship<T> {
  value?: number
  fields?: T
}

interface EquipSlotFields {
  Head?: number
  Body?: number
  Gloves?: number
  Legs?: number
  Feet?: number
}

interface SearchFields {
  Name?: string
  Icon?: { path?: string; path_hr1?: string }
  ModelMain?: number
  EquipSlotCategory?: Relationship<EquipSlotFields>
  DyeCount?: number
  LevelEquip?: number
  ClassJobCategory?: Relationship<{ Name?: string }>
}

interface SearchResponse {
  next?: string
  version?: string
  results?: Array<{ row_id?: number; fields?: SearchFields }>
}

function apiBaseUrl(): URL {
  const configured = import.meta.env.VITE_XIVAPI_BASE_URL || DEFAULT_XIVAPI_BASE_URL
  const url = new URL(configured)
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('VITE_XIVAPI_BASE_URL must be an http(s) URL.')
  if (!url.pathname.endsWith('/')) url.pathname += '/'
  return url
}

function escapeQueryValue(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')
}

function armorSlot(fields?: EquipSlotFields): ArmorSlot | undefined {
  if ((fields?.Head ?? 0) > 0) return 'head'
  if ((fields?.Body ?? 0) > 0) return 'body'
  if ((fields?.Gloves ?? 0) > 0) return 'hands'
  if ((fields?.Legs ?? 0) > 0) return 'legs'
  if ((fields?.Feet ?? 0) > 0) return 'feet'
  return undefined
}

export function decodeEquipmentModel(modelValue: number): { set: number; variant: number } {
  if (!Number.isSafeInteger(modelValue) || modelValue <= 0) return { set: 0, variant: 0 }
  return {
    set: modelValue % 65_536,
    variant: Math.floor(modelValue / 65_536) % 65_536,
  }
}

export function xivapiIconUrl(path: string): string {
  const url = new URL('asset', apiBaseUrl())
  url.searchParams.set('path', path)
  url.searchParams.set('format', 'webp')
  return url.toString()
}

export async function searchArmor(search: string, signal?: AbortSignal): Promise<ArmorSearchPage> {
  const term = search.trim()
  if (term.length < 2) throw new Error('Enter at least two characters.')

  const url = new URL('search', apiBaseUrl())
  url.searchParams.set('sheets', 'Item')
  url.searchParams.set('fields', FIELDS)
  url.searchParams.set('limit', '30')
  url.searchParams.set('query', `+Name~"${escapeQueryValue(term)}" +(${ARMOR_SLOT_QUERY})`)

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
    const slot = armorSlot(fields?.EquipSlotCategory?.fields)
    const modelValue = fields?.ModelMain
    if (!fields?.Name || id === undefined || !slot || !modelValue) return []

    const model = decodeEquipmentModel(modelValue)
    if (!model.set) return []
    return [{
      id,
      name: fields.Name,
      iconPath: fields.Icon?.path_hr1 ?? fields.Icon?.path,
      modelValue,
      modelSet: model.set,
      modelVariant: model.variant,
      slot,
      dyeCount: fields.DyeCount ?? 0,
      equipLevel: fields.LevelEquip ?? 0,
      jobs: fields.ClassJobCategory?.fields?.Name ?? 'All classes',
    }]
  })

  return {
    items,
    next: payload.next,
    version: payload.version ?? 'latest',
  }
}
