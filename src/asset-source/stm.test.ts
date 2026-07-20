import { describe, expect, it } from 'vitest'
import type { MaterialColorTable, MaterialDyeRow } from './mtrl'
import { applyStainColors, applyStains, parseStainingTemplate } from './stm'

const HALF = { zero: 0x0000, quarter: 0x3400, half: 0x3800, one: 0x3c00 }

function legacyFixture(): ArrayBuffer {
  const columnValues = [
    [HALF.half, HALF.quarter, HALF.one],
    [HALF.quarter, HALF.quarter, HALF.quarter],
    [HALF.zero, HALF.zero, HALF.zero],
    [HALF.one],
    [HALF.half],
  ]
  const entryHeaderSize = columnValues.length * 2
  const entryDataSize = columnValues.reduce((sum, values) => sum + values.length * 2, 0)
  const buffer = new ArrayBuffer(16 + entryHeaderSize + entryDataSize)
  const view = new DataView(buffer)
  view.setUint16(0, 0x534d, true)
  view.setUint16(2, 0x0101, true)
  view.setUint16(4, 1, true)
  view.setUint32(8, 12, true)
  view.setUint32(12, 0, true)
  let halfEnd = 0
  columnValues.forEach((values, index) => {
    halfEnd += values.length
    view.setUint16(16 + index * 2, halfEnd, true)
  })
  let cursor = 16 + entryHeaderSize
  columnValues.flat().forEach((value) => {
    view.setUint16(cursor, value, true)
    cursor += 2
  })
  return buffer
}

function compressedLegacyFixture(): ArrayBuffer {
  const columnLengths = [260, 6, 6, 2, 2]
  const entryHeaderSize = columnLengths.length * 2
  const entryDataSize = columnLengths.reduce((sum, length) => sum + length, 0)
  const buffer = new ArrayBuffer(16 + entryHeaderSize + entryDataSize)
  const view = new DataView(buffer)
  view.setUint16(0, 0x534d, true)
  view.setUint16(2, 0x0101, true)
  view.setUint16(4, 1, true)
  view.setUint32(8, 12, true)
  view.setUint32(12, 0, true)
  let halfEnd = 0
  columnLengths.forEach((length, index) => {
    halfEnd += length / 2
    view.setUint16(16 + index * 2, halfEnd, true)
  })
  let cursor = 16 + entryHeaderSize
  // One diffuse palette value followed by 254 stain-indexed palette bytes.
  view.setUint16(cursor, HALF.half, true)
  view.setUint16(cursor + 2, HALF.quarter, true)
  view.setUint16(cursor + 4, HALF.one, true)
  cursor += 6
  view.setUint8(cursor, 0xff) // position 0 is the "no stain" sentinel
  view.setUint8(cursor + 1, 1) // stain 1 -> palette entry 1
  view.setUint8(cursor + 2, 0) // stain 2 -> empty
  view.setUint8(cursor + 3, 9) // stain 3 -> out-of-range palette byte
  cursor += 254
  ;[
    [HALF.quarter, HALF.quarter, HALF.quarter],
    [HALF.zero, HALF.zero, HALF.zero],
    [HALF.one],
    [HALF.half],
  ].flat().forEach((value) => {
    view.setUint16(cursor, value, true)
    cursor += 2
  })
  return buffer
}

function dawntrailFixture(): ArrayBuffer {
  // One entry keyed 1200 with a single diffuse value and empty remaining columns.
  const columnCount = 12
  const entryHeaderSize = columnCount * 2
  const buffer = new ArrayBuffer(16 + entryHeaderSize + 6)
  const view = new DataView(buffer)
  view.setUint16(0, 0x534d, true)
  view.setUint16(2, 0x0201, true)
  view.setUint16(4, 1, true)
  view.setUint8(6, 3)
  view.setUint8(7, 9)
  view.setUint32(8, 1200, true)
  view.setUint32(12, 0, true)
  for (let index = 0; index < columnCount; index += 1) {
    view.setUint16(16 + index * 2, 3, true) // every column ends after the 3-half diffuse value
  }
  view.setUint16(16 + entryHeaderSize, HALF.half, true)
  view.setUint16(16 + entryHeaderSize + 2, HALF.quarter, true)
  view.setUint16(16 + entryHeaderSize + 4, HALF.one, true)
  return buffer
}

describe('FFXIV staining templates', () => {
  it('parses repeated legacy dye packs by template and stain ID', () => {
    const template = parseStainingTemplate(legacyFixture(), 'legacy')
    expect(template.get(12, 1)).toMatchObject({
      diffuse: [0.5, 0.25, 1],
      specular: [0.25, 0.25, 0.25],
      emissive: [0, 0, 0],
      shininess: 1,
      specularMask: 0.5,
    })
    expect(template.get(12, 128)?.diffuse).toEqual([0.5, 0.25, 1])
    expect(template.get(99, 1)).toBeUndefined()
    expect(template.get(12, 0)).toBeUndefined()
  })

  it('reads compressed stain indices without shifting them by one dye', () => {
    const template = parseStainingTemplate(compressedLegacyFixture(), 'legacy')
    expect(template.get(12, 1)?.diffuse).toEqual([0.5, 0.25, 1])
    expect(template.get(12, 2)?.diffuse).toEqual([0, 0, 0])
    expect(template.get(12, 3)?.diffuse).toEqual([0, 0, 0])
    expect(template.get(12, 254)?.diffuse).toEqual([0, 0, 0])
  })

  it('resolves legacy-range Dawntrail templates against their +1000 keys', () => {
    const template = parseStainingTemplate(dawntrailFixture(), 'dawntrail')
    expect(template.get(200, 1)?.diffuse).toEqual([0.5, 0.25, 1])
    expect(template.get(1200, 1)?.diffuse).toEqual([0.5, 0.25, 1])
    expect(template.get(300, 1)).toBeUndefined()
  })

  it('applies only the fields and channel selected by each MTRL dye row', () => {
    const row = {
      diffuse: [1, 1, 1],
      specular: [1, 1, 1],
      emissive: [1, 1, 1],
      specularMask: 1,
      roughness: 0,
      metalness: 0,
    } as MaterialColorTable['rows'][number]
    const table: MaterialColorTable = { kind: 'legacy', rows: [row, row] }
    const dyeRows: MaterialDyeRow[] = [
      { template: 12, channel: 0, flags: 0x19 },
      { template: 12, channel: 1, flags: 0x01 },
    ]
    const result = applyStains(table, dyeRows, parseStainingTemplate(legacyFixture(), 'legacy'), [4, 0])
    expect(result.appliedRows).toBe(1)
    expect(result.table.rows[0]).toMatchObject({ diffuse: [0.5, 0.25, 1], specularMask: 0.5 })
    expect(result.table.rows[0]!.roughness).toBeGreaterThan(0)
    expect(result.table.rows[1]).toBe(row)
  })

  it('falls back to the selected catalog color for a dyeable row', () => {
    const row = {
      diffuse: [1, 1, 1], specular: [1, 1, 1], emissive: [0, 0, 0],
      specularMask: 1, roughness: 1, metalness: 0,
    } as MaterialColorTable['rows'][number]
    const result = applyStainColors(
      { kind: 'dawntrail', rows: [row, row] },
      [{ template: 12, channel: 0, flags: 0x01 }, { template: 12, channel: 1, flags: 0x01 }],
      [1, 0],
      [0xff0000, null],
    )
    expect(result.appliedRows).toBe(1)
    expect(result.table.rows[0]!.diffuse).toEqual([1, 0, 0])
    expect(result.table.rows[1]).toBe(row)
  })
})
