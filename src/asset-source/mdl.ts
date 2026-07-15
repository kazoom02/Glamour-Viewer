import { parseModelPayloadHeader } from './sqpack'

const MODEL_FILE_HEADER_SIZE = 0x44
const MODEL_PAYLOAD_HEADER_SIZE = 208
const BLOCK_HEADER_SIZE = 16
const BLOCK_UNCOMPRESSED = 32000

export interface DecodedModelMesh {
  positions: Float32Array
  normals?: Float32Array
  uvs?: Float32Array
  skinIndices?: Uint16Array
  skinWeights?: Float32Array
  bonePalette?: string[]
  indices: Uint16Array
  materialIndex: number
  attributes?: string[]
}

export interface DecodedModel {
  meshes: DecodedModelMesh[]
  materialPaths: string[]
  boneNames: string[]
  bounds: { min: [number, number, number]; max: [number, number, number] }
}

interface VertexElement {
  stream: number
  offset: number
  dataType: number
  usage: number
  usageIndex: number
}

interface MeshDescriptor {
  vertexCount: number
  indexCount: number
  materialIndex: number
  boneTableIndex: number
  submeshIndex: number
  submeshCount: number
  startIndex: number
  vertexBufferOffsets: number[]
  vertexBufferStrides: number[]
  vertexStreamCount: number
}

interface SubmeshDescriptor {
  indexOffset: number
  indexCount: number
  attributeMask: number
}

interface LodDescriptor {
  meshIndex: number
  meshCount: number
}

function assertDecode(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function concat(parts: Uint8Array[], total = parts.reduce((sum, part) => sum + part.byteLength, 0)): Uint8Array {
  const output = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    output.set(part, offset)
    offset += part.byteLength
  }
  return output
}

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const format = 'deflate-raw' as CompressionFormat
  const input = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream(format))
  return new Uint8Array(await new Response(input).arrayBuffer())
}

async function decodeBlock(payload: Uint8Array, offset: number, onDiskSize: number): Promise<Uint8Array> {
  assertDecode(offset + BLOCK_HEADER_SIZE <= payload.byteLength, 'A SqPack data block header is truncated.')
  const view = new DataView(payload.buffer, payload.byteOffset + offset, payload.byteLength - offset)
  const headerSize = view.getUint32(0, true)
  const compressedSize = view.getUint32(8, true)
  const expectedSize = view.getUint32(12, true)
  assertDecode(headerSize === BLOCK_HEADER_SIZE, `Unsupported SqPack block header size ${headerSize}.`)
  assertDecode(expectedSize <= 1024 * 1024, 'A SqPack block exceeds the decoder safety limit.')

  let decoded: Uint8Array
  if (compressedSize === BLOCK_UNCOMPRESSED) {
    assertDecode(offset + headerSize + expectedSize <= payload.byteLength, 'An uncompressed SqPack block is truncated.')
    decoded = payload.slice(offset + headerSize, offset + headerSize + expectedSize)
  } else {
    assertDecode(compressedSize > 0, 'A compressed SqPack block has an invalid compressed size.')
    assertDecode(
      headerSize + compressedSize <= onDiskSize && offset + headerSize + compressedSize <= payload.byteLength,
      'A compressed SqPack block is truncated.',
    )
    try {
      // onDiskSize includes alignment padding. DecompressionStream rejects those
      // trailing bytes, so use the exact compressed byte count from the block header.
      decoded = await inflateRaw(payload.slice(offset + headerSize, offset + headerSize + compressedSize))
    } catch (error) {
      const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
      throw new Error(`Failed to inflate SqPack block at offset ${offset} (${compressedSize} → ${expectedSize} bytes): ${detail}`)
    }
  }
  assertDecode(decoded.byteLength === expectedSize, `SqPack block decoded to ${decoded.byteLength} bytes; expected ${expectedSize}.`)
  return decoded
}

export async function reconstructMdl(payloadBuffer: ArrayBuffer): Promise<ArrayBuffer> {
  const header = parseModelPayloadHeader(payloadBuffer.slice(0, Math.min(payloadBuffer.byteLength, 1024 * 1024)))
  const payload = new Uint8Array(payloadBuffer)
  const decodedSections: Uint8Array[] = []
  let blockIndex = 0

  for (const section of header.sections) {
    const blocks: Uint8Array[] = []
    let cursor = header.headerSize + section.offset
    for (let block = 0; block < section.blockCount; block += 1) {
      const onDiskSize = header.blockSizes[blockIndex]!
      blocks.push(await decodeBlock(payload, cursor, onDiskSize))
      cursor += onDiskSize
      blockIndex += 1
    }
    decodedSections.push(concat(blocks))
  }

  assertDecode(decodedSections.length === 11, 'The SqPack model section table is incomplete.')
  const stackSize = decodedSections[0]!.byteLength
  const runtimeSize = decodedSections[1]!.byteLength
  const vertexSizes: [number, number, number] = [decodedSections[2]!.byteLength, decodedSections[5]!.byteLength, decodedSections[8]!.byteLength]
  const indexSizes: [number, number, number] = [decodedSections[4]!.byteLength, decodedSections[7]!.byteLength, decodedSections[10]!.byteLength]
  const vertexOffsets: [number, number, number] = [0, 0, 0]
  const indexOffsets: [number, number, number] = [0, 0, 0]
  let cursor = MODEL_FILE_HEADER_SIZE + stackSize + runtimeSize
  for (let lod = 0; lod < 3; lod += 1) {
    if (vertexSizes[lod]) vertexOffsets[lod] = cursor
    cursor += vertexSizes[lod]!
    cursor += decodedSections[3 + lod * 3]!.byteLength
    if (indexSizes[lod]) indexOffsets[lod] = cursor
    cursor += indexSizes[lod]!
  }

  const body = concat(decodedSections)
  const mdl = new Uint8Array(MODEL_FILE_HEADER_SIZE + body.byteLength)
  const view = new DataView(mdl.buffer)
  view.setUint32(0, header.version, true)
  view.setUint32(4, stackSize, true)
  view.setUint32(8, runtimeSize, true)
  view.setUint16(12, header.vertexDeclarationCount, true)
  view.setUint16(14, header.materialCount, true)
  vertexOffsets.forEach((value, index) => view.setUint32(16 + index * 4, value, true))
  indexOffsets.forEach((value, index) => view.setUint32(28 + index * 4, value, true))
  vertexSizes.forEach((value, index) => view.setUint32(40 + index * 4, value, true))
  indexSizes.forEach((value, index) => view.setUint32(52 + index * 4, value, true))
  view.setUint8(64, header.lodCount)
  view.setUint8(65, header.indexBufferStreamingEnabled)
  view.setUint8(66, header.edgeGeometryEnabled)
  mdl.set(body, MODEL_FILE_HEADER_SIZE)
  return mdl.buffer
}

function f16(value: number): number {
  const sign = (value & 0x8000) << 16
  let exponent = (value >>> 10) & 0x1f
  let mantissa = value & 0x3ff
  let bits: number
  if (exponent === 0) {
    if (mantissa === 0) bits = sign
    else {
      exponent = 1
      while ((mantissa & 0x400) === 0) {
        mantissa <<= 1
        exponent -= 1
      }
      mantissa &= 0x3ff
      bits = sign | ((exponent + 112) << 23) | (mantissa << 13)
    }
  } else if (exponent === 31) bits = sign | 0x7f800000 | (mantissa << 13)
  else bits = sign | ((exponent + 112) << 23) | (mantissa << 13)
  const holder = new ArrayBuffer(4)
  new DataView(holder).setUint32(0, bits >>> 0, true)
  return new DataView(holder).getFloat32(0, true)
}

function dataTypeSize(type: number): number {
  if ([0, 4, 5, 6, 8, 9, 11, 13, 14, 15].includes(type)) return 4
  if ([1, 7, 10, 12, 16].includes(type)) return 8
  if (type === 2) return 12
  if (type === 3) return 16
  throw new Error(`Unsupported FFXIV vertex data type ${type}.`)
}

function snorm16(value: number): number {
  return Math.max(-1, value / 32767)
}

function signed10(value: number): number {
  return value & 0x200 ? value - 0x400 : value
}

function floats(view: DataView, offset: number, type: number): number[] {
  switch (type) {
    case 0: return [view.getFloat32(offset, true)]
    case 1: return [view.getFloat32(offset, true), view.getFloat32(offset + 4, true)]
    case 2: return [view.getFloat32(offset, true), view.getFloat32(offset + 4, true), view.getFloat32(offset + 8, true)]
    case 3: return [view.getFloat32(offset, true), view.getFloat32(offset + 4, true), view.getFloat32(offset + 8, true), view.getFloat32(offset + 12, true)]
    case 4: return [view.getUint8(offset + 2) / 255, view.getUint8(offset + 1) / 255, view.getUint8(offset) / 255, view.getUint8(offset + 3) / 255]
    case 5: return [view.getUint8(offset), view.getUint8(offset + 1), view.getUint8(offset + 2), view.getUint8(offset + 3)]
    case 6: return [view.getInt16(offset, true), view.getInt16(offset + 2, true)]
    case 7: return [view.getInt16(offset, true), view.getInt16(offset + 2, true), view.getInt16(offset + 4, true), view.getInt16(offset + 6, true)]
    case 8: return [view.getUint8(offset) / 255, view.getUint8(offset + 1) / 255, view.getUint8(offset + 2) / 255, view.getUint8(offset + 3) / 255]
    case 9: return [snorm16(view.getInt16(offset, true)), snorm16(view.getInt16(offset + 2, true))]
    case 10: return [snorm16(view.getInt16(offset, true)), snorm16(view.getInt16(offset + 2, true)), snorm16(view.getInt16(offset + 4, true)), snorm16(view.getInt16(offset + 6, true))]
    case 11: return [view.getUint16(offset, true) / 65535, view.getUint16(offset + 2, true) / 65535]
    case 12: return [view.getUint16(offset, true) / 65535, view.getUint16(offset + 2, true) / 65535, view.getUint16(offset + 4, true) / 65535, view.getUint16(offset + 6, true) / 65535]
    case 13: {
      const packed = view.getUint32(offset, true)
      return [packed & 0x3ff, (packed >>> 10) & 0x3ff, (packed >>> 20) & 0x3ff]
    }
    case 14: {
      const packed = view.getUint32(offset, true)
      return [signed10(packed & 0x3ff) / 511, signed10((packed >>> 10) & 0x3ff) / 511, signed10((packed >>> 20) & 0x3ff) / 511]
    }
    case 15: return [f16(view.getUint16(offset, true)), f16(view.getUint16(offset + 2, true))]
    case 16: return [f16(view.getUint16(offset, true)), f16(view.getUint16(offset + 2, true)), f16(view.getUint16(offset + 4, true)), f16(view.getUint16(offset + 6, true))]
    default: throw new Error(`Unsupported FFXIV vertex data type ${type}.`)
  }
}

function readVertex(
  view: DataView,
  vertexBufferOffset: number,
  mesh: MeshDescriptor,
  element: VertexElement,
  vertexIndex: number,
): number[] {
  const stream = element.stream
  assertDecode(stream < mesh.vertexStreamCount && stream < 3, 'A vertex declaration references an inactive stream.')
  const offset = vertexBufferOffset + mesh.vertexBufferOffsets[stream]! + vertexIndex * mesh.vertexBufferStrides[stream]! + element.offset
  assertDecode(offset + dataTypeSize(element.dataType) <= view.byteLength, 'A vertex attribute extends beyond the model buffer.')
  return floats(view, offset, element.dataType)
}

function readString(view: DataView, buffer: ArrayBuffer, tableStart: number, tableEnd: number, relativeOffset: number): string {
  const start = tableStart + relativeOffset
  assertDecode(start < tableEnd, 'An MDL name points beyond the string table.')
  let end = start
  while (end < tableEnd && view.getUint8(end) !== 0) end += 1
  return new TextDecoder().decode(new Uint8Array(buffer, start, end - start))
}

export function decodeMdl(mdlBuffer: ArrayBuffer): DecodedModel {
  assertDecode(mdlBuffer.byteLength >= MODEL_FILE_HEADER_SIZE, 'The reconstructed MDL header is truncated.')
  const view = new DataView(mdlBuffer)
  const vertexDeclarationCount = view.getUint16(12, true)
  const vertexOffsets: [number, number, number] = [view.getUint32(16, true), view.getUint32(20, true), view.getUint32(24, true)]
  const indexOffsets: [number, number, number] = [view.getUint32(28, true), view.getUint32(32, true), view.getUint32(36, true)]
  let cursor = MODEL_FILE_HEADER_SIZE
  const declarations: VertexElement[][] = []
  for (let declaration = 0; declaration < vertexDeclarationCount; declaration += 1) {
    const elements: VertexElement[] = []
    for (let slot = 0; slot < 17; slot += 1) {
      const offset = cursor + slot * 8
      const stream = view.getUint8(offset)
      const dataType = view.getUint8(offset + 2)
      if (stream === 0xff || dataType === 17) break
      elements.push({
        stream,
        offset: view.getUint8(offset + 1),
        dataType,
        usage: view.getUint8(offset + 3),
        usageIndex: view.getUint8(offset + 4),
      })
    }
    declarations.push(elements)
    cursor += 17 * 8
  }

  cursor += 4 // string count + padding
  const stringSize = view.getUint32(cursor, true)
  cursor += 4
  const stringTableOffset = cursor
  const stringTableEnd = stringTableOffset + stringSize
  assertDecode(stringTableEnd <= view.byteLength, 'The MDL string table is truncated.')
  cursor = stringTableEnd
  assertDecode(cursor + 56 <= view.byteLength, 'The MDL semantic header is truncated.')
  const modelHeader = cursor
  const meshCount = view.getUint16(modelHeader + 4, true)
  const attributeCount = view.getUint16(modelHeader + 6, true)
  const submeshCount = view.getUint16(modelHeader + 8, true)
  const materialCount = view.getUint16(modelHeader + 10, true)
  const boneCount = view.getUint16(modelHeader + 12, true)
  const boneTableCount = view.getUint16(modelHeader + 14, true)
  const flags2 = view.getUint8(modelHeader + 27)
  const elementIdCount = view.getUint16(modelHeader + 24, true)
  const terrainShadowMeshCount = view.getUint8(modelHeader + 26)
  const terrainShadowSubmeshCount = view.getUint16(modelHeader + 38, true)
  cursor += 56 + elementIdCount * 32

  const lods: LodDescriptor[] = []
  for (let lod = 0; lod < 3; lod += 1) {
    lods.push({ meshIndex: view.getUint16(cursor, true), meshCount: view.getUint16(cursor + 2, true) })
    cursor += 60
  }
  if (flags2 & 0x10) cursor += 3 * 40

  const meshes: MeshDescriptor[] = []
  for (let mesh = 0; mesh < meshCount; mesh += 1) {
    assertDecode(cursor + 36 <= view.byteLength, 'The MDL mesh table is truncated.')
    meshes.push({
      vertexCount: view.getUint16(cursor, true),
      indexCount: view.getUint32(cursor + 4, true),
      materialIndex: view.getUint16(cursor + 8, true),
      submeshIndex: view.getUint16(cursor + 10, true),
      submeshCount: view.getUint16(cursor + 12, true),
      boneTableIndex: view.getUint16(cursor + 14, true),
      startIndex: view.getUint32(cursor + 16, true),
      vertexBufferOffsets: [view.getUint32(cursor + 20, true), view.getUint32(cursor + 24, true), view.getUint32(cursor + 28, true)],
      vertexBufferStrides: [view.getUint8(cursor + 32), view.getUint8(cursor + 33), view.getUint8(cursor + 34)],
      vertexStreamCount: view.getUint8(cursor + 35),
    })
    cursor += 36
  }

  assertDecode(cursor + attributeCount * 4 <= view.byteLength, 'The MDL attribute-offset table is truncated.')
  const attributeNames = Array.from({ length: attributeCount }, (_, index) => (
    readString(view, mdlBuffer, stringTableOffset, stringTableEnd, view.getUint32(cursor + index * 4, true))
  ))
  cursor += attributeCount * 4
  cursor += terrainShadowMeshCount * 20
  assertDecode(cursor + submeshCount * 16 <= view.byteLength, 'The MDL submesh table is truncated.')
  const submeshes: SubmeshDescriptor[] = Array.from({ length: submeshCount }, (_, index) => {
    const offset = cursor + index * 16
    return {
      indexOffset: view.getUint32(offset, true),
      indexCount: view.getUint32(offset + 4, true),
      attributeMask: view.getUint32(offset + 8, true),
    }
  })
  cursor += submeshCount * 16
  cursor += terrainShadowSubmeshCount * 12
  assertDecode(cursor + materialCount * 4 <= view.byteLength, 'The MDL material-offset table is truncated.')
  const materialPaths = Array.from({ length: materialCount }, (_, index) => {
    const relativeOffset = view.getUint32(cursor + index * 4, true)
    return readString(view, mdlBuffer, stringTableOffset, stringTableEnd, relativeOffset)
  })
  cursor += materialCount * 4
  assertDecode(cursor + boneCount * 4 <= view.byteLength, 'The MDL bone-name table is truncated.')
  const boneNames = Array.from({ length: boneCount }, (_, index) => (
    readString(view, mdlBuffer, stringTableOffset, stringTableEnd, view.getUint32(cursor + index * 4, true))
  ))
  cursor += boneCount * 4

  const boneTables: number[][] = []
  const version = view.getUint32(0, true)
  if (version <= 0x01000005) {
    assertDecode(cursor + boneTableCount * 132 <= view.byteLength, 'The legacy MDL bone tables are truncated.')
    for (let table = 0; table < boneTableCount; table += 1) {
      const start = cursor + table * 132
      const count = Math.min(view.getUint8(start + 128), 64)
      boneTables.push(Array.from({ length: count }, (_, index) => view.getUint16(start + index * 2, true)))
    }
    cursor += boneTableCount * 132
  } else {
    assertDecode(cursor + boneTableCount * 4 <= view.byteLength, 'The MDL v2 bone-table headers are truncated.')
    const counts = Array.from({ length: boneTableCount }, (_, index) => view.getUint16(cursor + index * 4 + 2, true))
    cursor += boneTableCount * 4
    for (const count of counts) {
      assertDecode(cursor + count * 2 <= view.byteLength, 'An MDL v2 bone palette is truncated.')
      boneTables.push(Array.from({ length: count }, (_, index) => view.getUint16(cursor + index * 2, true)))
      cursor += count * 2
      cursor += (4 - (cursor % 4)) % 4
    }
  }

  const lod = lods.findIndex((candidate, index) => candidate.meshCount > 0 && vertexOffsets[index]! > 0 && indexOffsets[index]! > 0)
  assertDecode(lod >= 0, 'The MDL contains no renderable level of detail.')
  const lodDescriptor = lods[lod]!
  const decoded: DecodedModelMesh[] = []
  const bounds = { min: [Infinity, Infinity, Infinity] as [number, number, number], max: [-Infinity, -Infinity, -Infinity] as [number, number, number] }

  for (let localIndex = 0; localIndex < lodDescriptor.meshCount; localIndex += 1) {
    const globalIndex = lodDescriptor.meshIndex + localIndex
    const mesh = meshes[globalIndex]
    const declaration = declarations[globalIndex]
    if (!mesh || !declaration) continue
    const positionElement = declaration.find((element) => element.usage === 0)
    const normalElement = declaration.find((element) => element.usage === 3)
    const uvElement = declaration.find((element) => element.usage === 4 && element.usageIndex === 0)
    const weightElement = declaration.find((element) => element.usage === 1)
    const boneElement = declaration.find((element) => element.usage === 2)
    if (!positionElement) continue

    const positions = new Float32Array(mesh.vertexCount * 3)
    const normals = normalElement ? new Float32Array(mesh.vertexCount * 3) : undefined
    const uvs = uvElement ? new Float32Array(mesh.vertexCount * 2) : undefined
    const skinIndices = boneElement ? new Uint16Array(mesh.vertexCount * 4) : undefined
    const skinWeights = weightElement ? new Float32Array(mesh.vertexCount * 4) : undefined
    const boneTable = boneTables[mesh.boneTableIndex] ?? []
    for (let vertex = 0; vertex < mesh.vertexCount; vertex += 1) {
      const position = readVertex(view, vertexOffsets[lod]!, mesh, positionElement, vertex)
      positions.set(position.slice(0, 3), vertex * 3)
      for (let axis = 0; axis < 3; axis += 1) {
        bounds.min[axis] = Math.min(bounds.min[axis]!, position[axis]!)
        bounds.max[axis] = Math.max(bounds.max[axis]!, position[axis]!)
      }
      if (normalElement && normals) {
        const normal = readVertex(view, vertexOffsets[lod]!, mesh, normalElement, vertex).slice(0, 3)
        if (normalElement.dataType === 8) normal.forEach((value, axis) => { normal[axis] = value * 2 - 1 })
        normals.set(normal, vertex * 3)
      }
      if (uvElement && uvs) uvs.set(readVertex(view, vertexOffsets[lod]!, mesh, uvElement, vertex).slice(0, 2), vertex * 2)
      if (boneElement && skinIndices) {
        const localIndices = readVertex(view, vertexOffsets[lod]!, mesh, boneElement, vertex).slice(0, 4)
        localIndices.forEach((value, component) => { skinIndices[vertex * 4 + component] = boneTable[value] ?? value })
      }
      if (weightElement && skinWeights) {
        const weights = readVertex(view, vertexOffsets[lod]!, mesh, weightElement, vertex).slice(0, 4)
        if (weightElement.dataType === 5) weights.forEach((value, component) => { weights[component] = value / 255 })
        const sum = weights.reduce((total, value) => total + value, 0)
        if (sum > 0) weights.forEach((value, component) => { weights[component] = value / sum })
        skinWeights.set(weights, vertex * 4)
      }
    }

    const indexStart = indexOffsets[lod]! + mesh.startIndex * 2
    assertDecode(indexStart + mesh.indexCount * 2 <= view.byteLength, 'The MDL mesh index range is truncated.')
    const indices = new Uint16Array(mesh.indexCount)
    for (let index = 0; index < mesh.indexCount; index += 1) indices[index] = view.getUint16(indexStart + index * 2, true)
    const ranges = mesh.submeshCount > 0
      ? submeshes.slice(mesh.submeshIndex, mesh.submeshIndex + mesh.submeshCount).map((submesh) => ({
          start: submesh.indexOffset - mesh.startIndex,
          count: submesh.indexCount,
          attributes: attributeNames.filter((_, attribute) => (submesh.attributeMask & (1 << attribute)) !== 0),
        }))
      : [{ start: 0, count: mesh.indexCount, attributes: [] as string[] }]
    for (const range of ranges) {
      assertDecode(range.start >= 0 && range.start + range.count <= indices.length, 'An MDL submesh index range is invalid.')
      decoded.push({
        positions, normals, uvs, skinIndices, skinWeights,
        bonePalette: boneTable.map((index) => boneNames[index] ?? `bone-${index}`),
        indices: indices.slice(range.start, range.start + range.count),
        materialIndex: mesh.materialIndex,
        attributes: range.attributes,
      })
    }
  }

  assertDecode(decoded.length > 0, 'The MDL contains no decodable meshes.')
  return { meshes: decoded, materialPaths, boneNames, bounds }
}

export async function decodeSqpackModel(payload: ArrayBuffer): Promise<DecodedModel> {
  return decodeMdl(await reconstructMdl(payload))
}
