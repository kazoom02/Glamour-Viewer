const HEADER_SIZE = 16

export type TextureRole = 'diffuse' | 'normal' | 'mask' | 'specular' | 'index' | 'table' | 'unknown'

export interface MaterialTextureReference {
  path: string
  flags: number
  samplerId?: number
  role: TextureRole
}

export interface ParsedMaterial {
  version: number
  shaderPackage: string
  textures: MaterialTextureReference[]
  colorTable?: MaterialColorTable
  dyeTable?: MaterialDyeRow[]
}

export interface MaterialColorRow {
  diffuse: [number, number, number]
  specular: [number, number, number]
  emissive: [number, number, number]
  roughness: number
  metalness: number
}

export interface MaterialColorTable {
  kind: 'legacy' | 'dawntrail'
  rows: MaterialColorRow[]
}

export interface MaterialDyeRow {
  template: number
  channel: number
  flags: number
}

const SAMPLER_ROLES = new Map<number, TextureRole>([
  [0x88408c04, 'diffuse'],
  [0x213cb439, 'diffuse'],
  [0x563b84af, 'diffuse'],
  [0x1e6fef9c, 'diffuse'],
  [0x6968df0a, 'diffuse'],
  [0x115306be, 'diffuse'],
  [0x0c5ec1f1, 'normal'],
  [0xaab4d9e9, 'normal'],
  [0xddb3e97f, 'normal'],
  [0x8a4e82b6, 'mask'],
  [0x2b99e025, 'specular'],
  [0x1bbc2f12, 'specular'],
  [0x6cbb1f84, 'specular'],
  [0x565f8fd8, 'index'],
  [0x2005679f, 'table'],
])

const CANONICAL_SAMPLERS = new Set([
  0x115306be, // g_SamplerDiffuse
  0x0c5ec1f1, // g_SamplerNormal
  0x8a4e82b6, // g_SamplerMask
  0x2b99e025, // g_SamplerSpecular
  0x565f8fd8, // g_SamplerIndex
  0x2005679f, // g_SamplerTable
])

/** Orders canonical character samplers ahead of generic shader-specific aliases. */
export function materialTexturePriority(texture: MaterialTextureReference): number {
  if (texture.samplerId !== undefined && CANONICAL_SAMPLERS.has(texture.samplerId)) return 100
  if (texture.role !== 'unknown' && inferRole(texture.path) === texture.role) return 50
  return 10
}

function assertRange(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function readCString(bytes: Uint8Array, offset: number): string {
  assertRange(offset >= 0 && offset < bytes.byteLength, 'A MTRL string offset is out of range.')
  let end = offset
  while (end < bytes.byteLength && bytes[end] !== 0) end += 1
  return new TextDecoder().decode(bytes.subarray(offset, end))
}

function inferRole(path: string): TextureRole {
  const lower = path.toLowerCase()
  if (/(?:_n|_norm)\.tex$/.test(lower)) return 'normal'
  if (/(?:_m|_mask|_mult)\.tex$/.test(lower)) return 'mask'
  if (/(?:_s|_spec)\.tex$/.test(lower)) return 'specular'
  if (/(?:_d|_diff|_base)\.tex$/.test(lower)) return 'diffuse'
  return 'unknown'
}

function halfToFloat(value: number): number {
  const sign = value & 0x8000 ? -1 : 1
  const exponent = (value >>> 10) & 0x1f
  const fraction = value & 0x3ff
  if (exponent === 0) return sign * 2 ** -14 * (fraction / 1024)
  if (exponent === 0x1f) return fraction ? Number.NaN : sign * Number.POSITIVE_INFINITY
  return sign * 2 ** (exponent - 15) * (1 + fraction / 1024)
}

function finiteHalf(view: DataView, offset: number): number {
  const value = halfToFloat(view.getUint16(offset, true))
  return Number.isFinite(value) ? value : 0
}

function legacyRoughness(shininess: number): number {
  if (shininess <= 0) return 1
  const mip = -0.75 * Math.log2(shininess) + 6.25
  return 1 - Math.sqrt(Math.max(0, 1 - mip / 6))
}

function readColorTable(view: DataView, start: number, size: number, flags: number): {
  table?: MaterialColorTable
  dyeTable?: MaterialDyeRow[]
} {
  const hasTable = (flags & 0x4) !== 0
  if (!hasTable) return {}
  const dimensionLogs = (flags >>> 4) & 0xff
  const dawntrail = dimensionLogs === 0x53
  const legacy = dimensionLogs === 0 || dimensionLogs === 0x42
  if (!dawntrail && !legacy) return {}
  const rowCount = dawntrail ? 32 : 16
  const rowSize = dawntrail ? 64 : 32
  const tableSize = rowCount * rowSize
  if (tableSize > size) return {}
  const rows = Array.from({ length: rowCount }, (_, row): MaterialColorRow => {
    const offset = start + row * rowSize
    const vector = (half: number): [number, number, number] => [
      finiteHalf(view, offset + half * 2),
      finiteHalf(view, offset + (half + 1) * 2),
      finiteHalf(view, offset + (half + 2) * 2),
    ]
    return {
      diffuse: vector(0),
      specular: vector(4),
      emissive: vector(8),
      roughness: dawntrail
        ? finiteHalf(view, offset + 16 * 2)
        : legacyRoughness(finiteHalf(view, offset + 7 * 2)),
      metalness: dawntrail ? finiteHalf(view, offset + 18 * 2) : 0,
    }
  })
  const result: { table: MaterialColorTable; dyeTable?: MaterialDyeRow[] } = {
    table: { kind: dawntrail ? 'dawntrail' : 'legacy', rows },
  }
  if ((flags & 0x8) !== 0) {
    const dyeRowSize = dawntrail ? 4 : 2
    const dyeStart = start + tableSize
    if (tableSize + rowCount * dyeRowSize <= size) {
      result.dyeTable = Array.from({ length: rowCount }, (_, row) => {
        const raw = dawntrail
          ? view.getUint32(dyeStart + row * dyeRowSize, true)
          : view.getUint16(dyeStart + row * dyeRowSize, true)
        return dawntrail
          ? { template: (raw >>> 16) & 0x7ff, channel: (raw >>> 27) & 0x3, flags: raw & 0xfff }
          : { template: raw >>> 5, channel: 0, flags: raw & 0x1f }
      })
    }
  }
  return { table: result.table, dyeTable: result.dyeTable }
}

export function parseMtrl(bytes: ArrayBuffer): ParsedMaterial {
  assertRange(bytes.byteLength >= HEADER_SIZE, 'The MTRL header is truncated.')
  const view = new DataView(bytes)
  const version = view.getUint32(0, true)
  const fileSize = view.getUint16(4, true)
  const dataSetSize = view.getUint16(6, true)
  const stringTableSize = view.getUint16(8, true)
  const shaderNameOffset = view.getUint16(10, true)
  const textureCount = view.getUint8(12)
  const uvSetCount = view.getUint8(13)
  const colorSetCount = view.getUint8(14)
  const additionalDataSize = view.getUint8(15)
  const referenceCount = textureCount + uvSetCount + colorSetCount
  const stringStart = HEADER_SIZE + referenceCount * 4
  const stringEnd = stringStart + stringTableSize
  assertRange(stringEnd <= bytes.byteLength, 'The MTRL string table is truncated.')
  assertRange(fileSize === 0 || fileSize <= bytes.byteLength, 'The MTRL file size is invalid.')

  const strings = new Uint8Array(bytes, stringStart, stringTableSize)
  const textures = Array.from({ length: textureCount }, (_, index): MaterialTextureReference => {
    const referenceOffset = HEADER_SIZE + index * 4
    const stringOffset = view.getUint16(referenceOffset, true)
    const path = readCString(strings, stringOffset).replaceAll('\\', '/').replace(/^\/+/, '')
    return { path, flags: view.getUint16(referenceOffset + 2, true), role: inferRole(path) }
  })
  const shaderPackage = readCString(strings, shaderNameOffset)

  const additionalDataStart = stringEnd
  let tableFlags = 0
  for (let index = 0; index < Math.min(additionalDataSize, 4); index += 1) {
    tableFlags |= view.getUint8(additionalDataStart + index) << (index * 8)
  }
  const dataSetStart = stringEnd + additionalDataSize
  assertRange(dataSetStart + dataSetSize <= bytes.byteLength, 'The MTRL data set is truncated.')
  const { table: colorTable, dyeTable } = readColorTable(view, dataSetStart, dataSetSize, tableFlags)
  let cursor = dataSetStart + dataSetSize
  assertRange(cursor + 12 <= bytes.byteLength, 'The MTRL shader header is truncated.')
  const shaderValueListSize = view.getUint16(cursor, true)
  const shaderKeyCount = view.getUint16(cursor + 2, true)
  const constantCount = view.getUint16(cursor + 4, true)
  const samplerCount = view.getUint16(cursor + 6, true)
  cursor += 12 + shaderKeyCount * 8 + constantCount * 8
  assertRange(cursor + samplerCount * 12 + shaderValueListSize <= bytes.byteLength, 'The MTRL sampler table is truncated.')
  for (let index = 0; index < samplerCount; index += 1) {
    const samplerOffset = cursor + index * 12
    const samplerId = view.getUint32(samplerOffset, true)
    const textureIndex = view.getUint8(samplerOffset + 8)
    const texture = textures[textureIndex]
    if (!texture) continue
    texture.samplerId = samplerId
    texture.role = SAMPLER_ROLES.get(samplerId) ?? texture.role
  }
  return {
    version,
    shaderPackage,
    textures,
    ...(colorTable ? { colorTable } : {}),
    ...(dyeTable ? { dyeTable } : {}),
  }
}
