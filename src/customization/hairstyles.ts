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

interface CharaMakeCustomizeResponse {
  rows?: Array<{
    row_id?: number
    fields?: {
      FeatureID?: number
      Icon?: { path?: string; path_hr1?: string }
      IsPurchasable?: boolean
    }
  }>
}

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

async function fetchJson<T>(url: URL, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { headers: { Accept: 'application/json' }, mode: 'cors', signal })
  if (!response.ok) throw new Error(`XIVAPI returned HTTP ${response.status}.`)
  return response.json() as Promise<T>
}

/** Reads the exact hairstyle menu used by the selected tribe and gender. */
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

  const payload = await fetchJson<CharaMakeCustomizeResponse>(hairstyleRowsUrl(rowIds), signal)
  const byId = new Map<number, HairstyleOption>()
  for (const row of payload.rows ?? []) {
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
  const result = [...byId.values()]
  if (!result.length) throw new Error('XIVAPI returned no usable hairstyle models for this character.')
  return result
}
