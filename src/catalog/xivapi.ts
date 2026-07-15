import type { ArmorItem, ArmorSearchPage, ArmorSlot } from './types'

const DEFAULT_XIVAPI_BASE_URL = 'https://v2.xivapi.com/api/'
const SLOT_FIELDS: Record<ArmorSlot, keyof EquipSlotFields> = {
  head: 'Head',
  body: 'Body',
  hands: 'Gloves',
  legs: 'Legs',
  feet: 'Feet',
}
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

const PAGE_SIZE = 50

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

export function armorSearchUrl(search: string, slot: ArmorSlot): URL {
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

async function fetchArmorPage(url: URL, selectedSlot: ArmorSlot, signal?: AbortSignal): Promise<ArmorSearchPage> {

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
      slot: selectedSlot,
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

export function searchArmor(search: string, slot: ArmorSlot, signal?: AbortSignal): Promise<ArmorSearchPage> {
  return fetchArmorPage(armorSearchUrl(search, slot), slot, signal)
}

export function continueArmorSearch(cursor: string, slot: ArmorSlot, signal?: AbortSignal): Promise<ArmorSearchPage> {
  if (!cursor) throw new Error('The XIVAPI catalog cursor is empty.')
  return fetchArmorPage(cursorUrl(cursor), slot, signal)
}
