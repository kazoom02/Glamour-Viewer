import { xivapiApiUrl } from '../catalog/xivapi'
import type { CharacterGender } from './types'

export interface HairstyleOption {
  customizeId: number
  hairId: number
  iconPath?: string
  purchasable: boolean
}

interface CharaMakeStruct {
  Customize?: number
  SubMenuNum?: number
  SubMenuParam?: number[]
}

interface CharaMakeTypeResponse {
  fields?: { CharaMakeStruct?: CharaMakeStruct[] }
}

export interface HairstyleCatalogRow {
  row_id?: number
  fields?: {
    FeatureID?: number
    Icon?: { path?: string; path_hr1?: string }
    IsPurchasable?: boolean
  }
}

interface CharaMakeCustomizeResponse {
  rows?: HairstyleCatalogRow[]
}

const CUSTOMIZE_BLOCK_SIZE = 130

export function charaMakeTypeRow(tribeId: number, gender: CharacterGender): number {
  const tribe = Math.min(16, Math.max(1, Math.trunc(tribeId)))
  // CharaMakeType stores female first (Gender 0), then male (Gender 1).
  return (tribe - 1) * 2 + (gender === 'male' ? 1 : 0)
}

export function hairstyleMenuUrl(tribeId: number, gender: CharacterGender): URL {
  const url = xivapiApiUrl(`sheet/CharaMakeType/${charaMakeTypeRow(tribeId, gender)}`)
  url.searchParams.set('fields', [
    'CharaMakeStruct[].Customize',
    'CharaMakeStruct[].SubMenuNum',
    'CharaMakeStruct[].SubMenuParam',
  ].join(','))
  return url
}

export function hairstyleRowsUrl(rows: number[]): URL {
  const url = xivapiApiUrl('sheet/CharaMakeCustomize')
  url.searchParams.set('rows', rows.join(','))
  url.searchParams.set('fields', 'FeatureID,Icon,IsPurchasable')
  return url
}

/**
 * CharaMakeCustomize stores one 130-row compatibility block per character
 * model. CharaMakeType references only the always-available rows; unlockable
 * hairstyles remain in the same block with IsPurchasable set.
 */
export function hairstyleBlockRows(menuRows: number[]): number[] {
  if (!menuRows.length) return []
  const first = Math.min(...menuRows)
  const start = Math.floor((first - 1) / CUSTOMIZE_BLOCK_SIZE) * CUSTOMIZE_BLOCK_SIZE + 1
  return Array.from({ length: CUSTOMIZE_BLOCK_SIZE }, (_, index) => start + index)
}

export function hairstyleOptions(menuRows: number[], rows: HairstyleCatalogRow[]): HairstyleOption[] {
  const menuOrder = new Map(menuRows.map((row, index) => [row, index]))
  const candidates = rows
    .filter((row) => row.row_id !== undefined && (menuOrder.has(row.row_id) || row.fields?.IsPurchasable === true))
    .sort((left, right) => {
      const leftMenu = left.row_id === undefined ? undefined : menuOrder.get(left.row_id)
      const rightMenu = right.row_id === undefined ? undefined : menuOrder.get(right.row_id)
      if (leftMenu !== undefined && rightMenu !== undefined) return leftMenu - rightMenu
      if (leftMenu !== undefined) return -1
      if (rightMenu !== undefined) return 1
      return (left.row_id ?? 0) - (right.row_id ?? 0)
    })

  const byId = new Map<number, HairstyleOption>()
  for (const row of candidates) {
    const hairId = row.fields?.FeatureID
    const customizeId = row.row_id
    if (!hairId || customizeId === undefined || byId.has(hairId)) continue
    byId.set(hairId, {
      customizeId,
      hairId,
      iconPath: row.fields?.Icon?.path_hr1 ?? row.fields?.Icon?.path,
      purchasable: row.fields?.IsPurchasable ?? false,
    })
  }
  return [...byId.values()]
}

async function fetchJson<T>(url: URL, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { headers: { Accept: 'application/json' }, mode: 'cors', signal })
  if (!response.ok) throw new Error(`XIVAPI returned HTTP ${response.status}.`)
  return response.json() as Promise<T>
}

/** Reads every default and unlockable hairstyle compatible with the character. */
export async function fetchHairstyles(
  tribeId: number,
  gender: CharacterGender,
  signal?: AbortSignal,
): Promise<HairstyleOption[]> {
  const menu = await fetchJson<CharaMakeTypeResponse>(hairstyleMenuUrl(tribeId, gender), signal)
  const hair = menu.fields?.CharaMakeStruct?.find((entry) => entry.Customize === 6)
  const rowIds = (hair?.SubMenuParam ?? [])
    .slice(0, hair?.SubMenuNum ?? 0)
    .filter((value) => Number.isSafeInteger(value) && value > 0)
  if (!rowIds.length) throw new Error('XIVAPI returned no hairstyles for this character.')

  const payload = await fetchJson<CharaMakeCustomizeResponse>(hairstyleRowsUrl(hairstyleBlockRows(rowIds)), signal)
  const result = hairstyleOptions(rowIds, payload.rows ?? [])
  if (!result.length) throw new Error('XIVAPI returned no usable hairstyle models for this character.')
  return result
}
