import type { EquipmentDye } from './types'
import { xivapiApiUrl } from './xivapi'

export interface DyeOption extends EquipmentDye {
  shade: number
  subOrder: number
  metallic: boolean
}

interface StainFields {
  Name?: string
  Color?: number
  Shade?: number
  SubOrder?: number
  IsMetallic?: boolean
}

interface StainResponse {
  version?: string
  rows?: Array<{ row_id?: number; fields?: StainFields }>
}

let cachedCatalog: Promise<{ dyes: DyeOption[]; version: string }> | undefined

export function dyeCatalogUrl(): URL {
  const url = xivapiApiUrl('sheet/Stain')
  url.searchParams.set('fields', 'Name,Color,Shade,SubOrder,IsMetallic')
  url.searchParams.set('limit', '500')
  return url
}

export function decodeDyeCatalog(payload: StainResponse): { dyes: DyeOption[]; version: string } {
  const dyes = (payload.rows ?? []).flatMap<DyeOption>((row) => {
    const id = row.row_id
    const fields = row.fields
    if (!Number.isSafeInteger(id) || id === undefined || id < 0 || id > 254) return []
    if (!fields?.Name?.trim() || !Number.isSafeInteger(fields.Color) || fields.Color! < 0 || fields.Color! > 0xffffff) return []
    return [{
      id,
      name: fields.Name.trim(),
      color: fields.Color!,
      shade: Number.isSafeInteger(fields.Shade) ? fields.Shade! : 99,
      subOrder: Number.isSafeInteger(fields.SubOrder) ? fields.SubOrder! : id,
      metallic: fields.IsMetallic === true,
    }]
  }).sort((left, right) => left.shade - right.shade || left.subOrder - right.subOrder || left.id - right.id)
  return { dyes, version: payload.version ?? 'latest' }
}

export function loadDyeCatalog(): Promise<{ dyes: DyeOption[]; version: string }> {
  cachedCatalog ??= fetch(dyeCatalogUrl(), {
    headers: { Accept: 'application/json' },
    mode: 'cors',
  }).then(async (response) => {
    if (!response.ok) throw new Error(`XIVAPI returned HTTP ${response.status}.`)
    return decodeDyeCatalog(await response.json() as StainResponse)
  }).catch((error) => {
    cachedCatalog = undefined
    throw error
  })
  return cachedCatalog
}

export function dyeCssColor(color: number): string {
  return `#${Math.max(0, Math.min(0xffffff, color)).toString(16).padStart(6, '0')}`
}
