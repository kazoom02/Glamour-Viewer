import type { MaterialColorRow, MaterialColorTable, MaterialDyeRow } from './mtrl'

export const LEGACY_STAIN_TEMPLATE_PATH = 'chara/base_material/stainingtemplate.stm'
export const DAWNTRAIL_STAIN_TEMPLATE_PATH = 'chara/base_material/stainingtemplate_gud.stm'

const STAIN_COUNT = 254
type Color = [number, number, number]

interface Column<T> {
  value(index: number): T
}

interface StainingTemplateEntry {
  colors: Array<Column<Color>>
  scalars: Array<Column<number>>
}

export interface StainingTemplateDye {
  diffuse: Color
  specular: Color
  emissive: Color
  shininess?: number
  specularMask?: number
  scalar3?: number
  metalness?: number
  roughness?: number
  sheenRate?: number
  sheenTintRate?: number
  sheenAperture?: number
  anisotropy?: number
  sphereMapIndex?: number
  sphereMapMask?: number
}

export interface StainingTemplate {
  kind: MaterialColorTable['kind']
  entries: ReadonlyMap<number, StainingTemplateEntry>
  get(template: number, stain: number): StainingTemplateDye | undefined
}

function assertStm(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
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

function colorAt(view: DataView, offset: number): Color {
  return [finiteHalf(view, offset), finiteHalf(view, offset + 2), finiteHalf(view, offset + 4)]
}

function column<T>(
  bytes: Uint8Array,
  view: DataView,
  start: number,
  byteLength: number,
  elementSize: number,
  empty: T,
  read: (offset: number) => T,
): Column<T> {
  assertStm(start >= 0 && byteLength >= 0 && start + byteLength <= bytes.byteLength, 'An STM column is out of range.')
  if (byteLength === 0) return { value: () => empty }
  if (byteLength === elementSize) {
    const single = read(start)
    return { value: () => single }
  }
  if (byteLength === STAIN_COUNT * elementSize) {
    return { value: (index) => index >= 0 && index < STAIN_COUNT ? read(start + index * elementSize) : empty }
  }

  // Compressed columns store a small value palette followed by 254 byte
  // indices. Index byte zero is a marker; stain 1 starts at byte one.
  assertStm(byteLength >= STAIN_COUNT && (byteLength - STAIN_COUNT) % elementSize === 0, 'An STM compressed column has an invalid size.')
  const valueCount = (byteLength - STAIN_COUNT) / elementSize
  const values = Array.from({ length: valueCount + 1 }, (_, index) => index === 0 ? empty : read(start + (index - 1) * elementSize))
  const indicesStart = start + valueCount * elementSize
  return {
    value: (index) => {
      if (index < 0 || index >= STAIN_COUNT) return empty
      const paletteIndex = index < STAIN_COUNT - 1 ? bytes[indicesStart + index + 1]! : 0
      return values[paletteIndex] ?? empty
    },
  }
}

function parseEntry(
  bytes: Uint8Array,
  view: DataView,
  start: number,
  end: number,
  colorCount: number,
  scalarCount: number,
): StainingTemplateEntry {
  const columnCount = colorCount + scalarCount
  assertStm(start >= 0 && end <= bytes.byteLength && start + columnCount * 2 <= end, 'An STM entry header is truncated.')
  const lengths: number[] = []
  let previousEnd = 0
  for (let index = 0; index < columnCount; index += 1) {
    const nextEnd = view.getUint16(start + index * 2, true) * 2
    assertStm(nextEnd >= previousEnd, 'An STM entry has decreasing column offsets.')
    lengths.push(nextEnd - previousEnd)
    previousEnd = nextEnd
  }
  let cursor = start + columnCount * 2
  assertStm(cursor + previousEnd <= end, 'An STM entry column is truncated.')
  const colors = lengths.slice(0, colorCount).map((length) => {
    const result = column(bytes, view, cursor, length, 6, [0, 0, 0] as Color, (offset) => colorAt(view, offset))
    cursor += length
    return result
  })
  const scalars = lengths.slice(colorCount).map((length) => {
    const result = column(bytes, view, cursor, length, 2, 0, (offset) => finiteHalf(view, offset))
    cursor += length
    return result
  })
  return { colors, scalars }
}

export function parseStainingTemplate(bytes: ArrayBuffer, kind: MaterialColorTable['kind']): StainingTemplate {
  assertStm(bytes.byteLength >= 8, 'The STM header is truncated.')
  const data = new Uint8Array(bytes)
  const view = new DataView(bytes)
  assertStm(view.getUint16(0, true) === 0x534d, 'The STM magic number is invalid.')
  const version = view.getUint16(2, true)
  assertStm(version === 0x0101 || version === 0x0200 || version === 0x0201, `Unsupported STM version 0x${version.toString(16)}.`)
  const entryCount = view.getUint16(4, true)
  let colorCount = view.getUint8(6)
  let scalarCount = view.getUint8(7)
  if (version === 0x0101) {
    assertStm(colorCount === 0 && scalarCount === 0, 'The legacy STM column counts are invalid.')
    colorCount = 3
    scalarCount = 2
  }
  const expectedScalars = kind === 'legacy' ? 2 : 9
  assertStm(colorCount === 3 && scalarCount === expectedScalars, `The ${kind} STM column layout is invalid.`)
  assertStm(entryCount > 0 && 8 + entryCount * 8 <= bytes.byteLength, 'The STM key table is truncated.')

  const keys = Array.from({ length: entryCount }, (_, index) => view.getUint32(8 + index * 4, true))
  const offsetStart = 8 + entryCount * 4
  const offsets = Array.from({ length: entryCount }, (_, index) => view.getUint32(offsetStart + index * 4, true))
  for (let index = 1; index < offsets.length; index += 1) {
    assertStm(offsets[index]! >= offsets[index - 1]!, 'The STM entry offsets are not ordered.')
  }
  const dataStart = 8 + entryCount * 8
  assertStm(dataStart + offsets[0]! * 2 <= bytes.byteLength, 'The STM entry table is out of range.')
  const entries = new Map<number, StainingTemplateEntry>()
  keys.forEach((key, index) => {
    const start = dataStart + offsets[index]! * 2
    const end = index + 1 < offsets.length ? dataStart + offsets[index + 1]! * 2 : bytes.byteLength
    assertStm(end >= start && end <= bytes.byteLength, 'An STM entry range is invalid.')
    entries.set(key, parseEntry(data, view, start, end, colorCount, scalarCount))
  })

  return {
    kind,
    entries,
    get(template, stain) {
      if (!Number.isSafeInteger(stain) || stain <= 0 || stain > STAIN_COUNT) return undefined
      const entry = entries.get(template)
      if (!entry) return undefined
      const index = stain - 1
      const colors = entry.colors.map((item) => item.value(index))
      const scalars = entry.scalars.map((item) => item.value(index))
      const common = {
        diffuse: colors[0] ?? [0, 0, 0],
        specular: colors[1] ?? [0, 0, 0],
        emissive: colors[2] ?? [0, 0, 0],
      } satisfies Pick<StainingTemplateDye, 'diffuse' | 'specular' | 'emissive'>
      return kind === 'legacy'
        ? { ...common, shininess: scalars[0] ?? 0, specularMask: scalars[1] ?? 0 }
        : {
            ...common,
            scalar3: scalars[0] ?? 0,
            metalness: scalars[1] ?? 0,
            roughness: scalars[2] ?? 0,
            sheenRate: scalars[3] ?? 0,
            sheenTintRate: scalars[4] ?? 0,
            sheenAperture: scalars[5] ?? 0,
            anisotropy: scalars[6] ?? 0,
            sphereMapIndex: scalars[7] ?? 0,
            sphereMapMask: scalars[8] ?? 0,
          }
    },
  }
}

function legacyRoughness(shininess: number): number {
  if (shininess <= 0) return 1
  const mip = -0.75 * Math.log2(shininess) + 6.25
  return 1 - Math.sqrt(Math.max(0, 1 - mip / 6))
}

function copyRow(row: MaterialColorRow): MaterialColorRow {
  return {
    ...row,
    diffuse: [...row.diffuse],
    specular: [...row.specular],
    emissive: [...row.emissive],
  }
}

export function applyStains(
  table: MaterialColorTable,
  dyeRows: MaterialDyeRow[],
  template: StainingTemplate,
  stains: readonly number[],
): { table: MaterialColorTable; appliedRows: number } {
  assertStm(table.kind === template.kind, 'The MTRL and STM formats do not match.')
  let appliedRows = 0
  const rows = table.rows.map((original, index) => {
    const dyeRow = dyeRows[index]
    if (!dyeRow?.flags) return original
    const stain = stains[dyeRow.channel] ?? 0
    if (!stain) return original
    const dye = template.get(dyeRow.template, stain)
    if (!dye) return original
    const row = copyRow(original)
    if (dyeRow.flags & 0x01) row.diffuse = [...dye.diffuse]
    if (dyeRow.flags & 0x02) row.specular = [...dye.specular]
    if (dyeRow.flags & 0x04) row.emissive = [...dye.emissive]
    if (table.kind === 'legacy') {
      if (dyeRow.flags & 0x08) row.roughness = legacyRoughness(dye.shininess ?? 0)
      if (dyeRow.flags & 0x10) row.specularMask = dye.specularMask ?? row.specularMask
    } else {
      if (dyeRow.flags & 0x10) row.metalness = dye.metalness ?? row.metalness
      if (dyeRow.flags & 0x20) row.roughness = dye.roughness ?? row.roughness
    }
    appliedRows += 1
    return row
  })
  return { table: { ...table, rows }, appliedRows }
}
