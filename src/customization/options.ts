import { xivapiApiUrl } from '../catalog/xivapi'
import { charaMakeTypeRow } from './hairstyles'
import type { CharacterGender } from './types'

export type VisualCustomizationField = 'face' | 'jaw' | 'eyeShape' | 'irisSize' | 'eyebrows' | 'nose' | 'mouth' | 'facePaint'

export interface VisualCustomizationOption {
  value: number
  label: string
  detail?: string
  iconPath?: string
  rowId?: number
}

export interface CustomizationCatalog {
  options: Record<VisualCustomizationField, VisualCustomizationOption[]>
  facialFeatureCount: number
  tattooCount: number
}

interface MenuEntry {
  Customize?: number
  Menu?: { fields?: { Text?: string } }
  SubMenuGraphic?: number[]
  SubMenuNum?: number
  SubMenuParam?: number[]
}

interface MenuResponse {
  fields?: { CharaMakeStruct?: MenuEntry[] }
}

interface CustomizeRow {
  row_id?: number
  fields?: {
    FeatureID?: number
    Icon?: { path?: string; path_hr1?: string }
  }
}

interface CustomizeResponse {
  rows?: CustomizeRow[]
}

const MENU_IDS: Record<VisualCustomizationField, number> = {
  face: 5,
  jaw: 18,
  eyeShape: 16,
  irisSize: 15,
  eyebrows: 14,
  nose: 17,
  mouth: 19,
  facePaint: 24,
}

export function customizationMenuUrl(tribeId: number, gender: CharacterGender): URL {
  const url = xivapiApiUrl(`sheet/CharaMakeType/${charaMakeTypeRow(tribeId, gender)}`)
  url.searchParams.set('fields', [
    'CharaMakeStruct[].Customize',
    'CharaMakeStruct[].Menu.Text',
    'CharaMakeStruct[].SubMenuGraphic',
    'CharaMakeStruct[].SubMenuNum',
    'CharaMakeStruct[].SubMenuParam',
  ].join(','))
  return url
}

export function customizationRowsUrl(rows: number[]): URL {
  const url = xivapiApiUrl('sheet/CharaMakeCustomize')
  url.searchParams.set('rows', [...new Set(rows)].join(','))
  url.searchParams.set('fields', 'FeatureID,Icon')
  return url
}

function iconPath(iconId: number): string | undefined {
  if (!Number.isSafeInteger(iconId) || iconId <= 0) return undefined
  const padded = iconId.toString().padStart(6, '0')
  const directory = `${Math.floor(iconId / 1000) * 1000}`.padStart(6, '0')
  return `ui/icon/${directory}/${padded}_hr1.tex`
}

function label(field: VisualCustomizationField, value: number, index: number): string {
  if (field === 'facePaint' && value === 0) return 'None'
  if (field === 'irisSize') return value === 0 ? 'Large' : 'Small'
  return `${field === 'face' ? 'Face' : 'Option'} ${index + 1}`
}

export function buildCustomizationCatalog(entries: MenuEntry[], rows: CustomizeRow[]): CustomizationCatalog {
  const byRow = new Map(rows.flatMap((row) => row.row_id === undefined ? [] : [[row.row_id, row] as const]))
  const options = {} as Record<VisualCustomizationField, VisualCustomizationOption[]>
  for (const [field, customizeId] of Object.entries(MENU_IDS) as Array<[VisualCustomizationField, number]>) {
    const entry = entries.find((candidate) => candidate.Customize === customizeId)
    const count = Math.max(0, entry?.SubMenuNum ?? 0)
    options[field] = Array.from({ length: count }, (_, index) => {
      const rowId = entry?.SubMenuParam?.[index] ?? 0
      const row = byRow.get(rowId)
      const featureId = row?.fields?.FeatureID
      const graphic = entry?.SubMenuGraphic?.[index]
      const value = field === 'face'
        ? (graphic && graphic > 0 ? graphic : index + 1)
        : field === 'facePaint'
          ? (featureId ?? index)
          : (graphic ?? index)
      return {
        value,
        label: label(field, value, index),
        detail: field === 'facePaint' && value > 0 ? `Paint ${value}` : `Choice ${index + 1}`,
        iconPath: row?.fields?.Icon?.path_hr1 ?? row?.fields?.Icon?.path ?? (field === 'face' ? iconPath(rowId) : undefined),
        ...(rowId > 0 ? { rowId } : {}),
      }
    })
  }
  const checkboxEntries = entries.filter((entry) => entry.Customize === 12)
  return {
    options,
    facialFeatureCount: Math.min(5, Math.max(0, checkboxEntries[0]?.SubMenuNum ?? 0)),
    tattooCount: Math.min(2, Math.max(0, checkboxEntries[1]?.SubMenuNum ?? 0)),
  }
}

function fallbackOptions(field: VisualCustomizationField, count: number): VisualCustomizationOption[] {
  return Array.from({ length: count }, (_, index) => {
    const value = field === 'face' ? index + 1 : index
    return { value, label: label(field, value, index), detail: `Choice ${index + 1}` }
  })
}

export const FALLBACK_CUSTOMIZATION_CATALOG: CustomizationCatalog = {
  options: {
    face: fallbackOptions('face', 7),
    jaw: fallbackOptions('jaw', 4),
    eyeShape: fallbackOptions('eyeShape', 6),
    irisSize: fallbackOptions('irisSize', 2),
    eyebrows: fallbackOptions('eyebrows', 6),
    nose: fallbackOptions('nose', 6),
    mouth: fallbackOptions('mouth', 4),
    facePaint: fallbackOptions('facePaint', 27),
  },
  facialFeatureCount: 5,
  tattooCount: 2,
}

async function fetchJson<T>(url: URL, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { headers: { Accept: 'application/json' }, mode: 'cors', signal })
  if (!response.ok) throw new Error(`XIVAPI returned HTTP ${response.status}.`)
  return response.json() as Promise<T>
}

export async function fetchCustomizationCatalog(
  tribeId: number,
  gender: CharacterGender,
  signal?: AbortSignal,
): Promise<CustomizationCatalog> {
  const menu = await fetchJson<MenuResponse>(customizationMenuUrl(tribeId, gender), signal)
  const entries = menu.fields?.CharaMakeStruct ?? []
  const rowBackedMenus = new Set(Object.values(MENU_IDS).filter((id) => id !== MENU_IDS.face))
  const rowIds = entries
    .filter((entry) => entry.Customize !== undefined && rowBackedMenus.has(entry.Customize))
    .flatMap((entry) => entry.SubMenuParam?.slice(0, entry.SubMenuNum ?? 0) ?? [])
    .filter((row) => Number.isSafeInteger(row) && row > 0)
  const rows = rowIds.length
    ? (await fetchJson<CustomizeResponse>(customizationRowsUrl(rowIds), signal)).rows ?? []
    : []
  return buildCustomizationCatalog(entries, rows)
}
