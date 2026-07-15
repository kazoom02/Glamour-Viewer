import type { AssetSource } from './types'

const SQPACK_MAGIC = 'SqPack\0\0'
const SQPACK_HEADER_MIN = 24
const INDEX2_ENTRY_SIZE = 8
const MODEL_HEADER_SIZE = 208
const MAX_MODEL_HEADER_SIZE = 1024 * 1024
const MAX_MODEL_RANGE_SIZE = 64 * 1024 * 1024
const CHARACTER_REPOSITORIES = ['ex5', 'ex4', 'ex3', 'ex2', 'ex1', 'ffxiv'] as const

export interface SqpackLocation {
  dataFileId: number
  offset: number
  nextOffset?: number
}

interface ModelSection {
  offset: number
  blockCount: number
}

export interface ModelPayloadHeader {
  headerSize: number
  version: number
  vertexDeclarationCount: number
  materialCount: number
  lodCount: number
  indexBufferStreamingEnabled: number
  edgeGeometryEnabled: number
  sections: ModelSection[]
  blockSizes: number[]
}

function assertRange(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function magicAt(bytes: Uint8Array): string {
  return String.fromCharCode(...bytes.slice(0, 8))
}

const JAMCRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < table.length; i += 1) {
    let value = i
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    }
    table[i] = value >>> 0
  }
  return table
})()

/** FFXIV's lower-case path hash (CRC-32/JAMCRC). */
export function jamcrc(input: string | Uint8Array): number {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input.toLowerCase()) : input
  let checksum = 0xffffffff
  for (const byte of bytes) checksum = (JAMCRC_TABLE[(checksum ^ byte) & 0xff]! ^ (checksum >>> 8)) >>> 0
  return checksum >>> 0
}

export function locateIndex2Entry(indexBytes: ArrayBuffer, gamePath: string): SqpackLocation {
  const bytes = new Uint8Array(indexBytes)
  const view = new DataView(indexBytes)
  assertRange(bytes.byteLength >= SQPACK_HEADER_MIN, 'The SqPack index header is truncated.')
  assertRange(magicAt(bytes) === SQPACK_MAGIC, 'The selected file is not a SqPack index.')

  const sqpackHeaderSize = view.getUint32(12, true)
  assertRange(sqpackHeaderSize >= SQPACK_HEADER_MIN, 'The SqPack index header size is invalid.')
  assertRange(sqpackHeaderSize + 16 <= bytes.byteLength, 'The SqPack index-specific header is truncated.')

  const indexDataOffset = view.getUint32(sqpackHeaderSize + 8, true)
  const indexDataSize = view.getUint32(sqpackHeaderSize + 12, true)
  assertRange(indexDataSize % INDEX2_ENTRY_SIZE === 0, 'The index2 entry table has an invalid size.')
  assertRange(indexDataOffset + indexDataSize <= bytes.byteLength, 'The index2 entry table extends beyond the file.')

  const wantedHash = jamcrc(gamePath)
  let match: SqpackLocation | undefined
  const offsetsByDataFile = new Map<number, number[]>()

  for (let offset = indexDataOffset; offset < indexDataOffset + indexDataSize; offset += INDEX2_ENTRY_SIZE) {
    const hash = view.getUint32(offset, true)
    const packed = view.getUint32(offset + 4, true)
    const dataFileId = (packed >>> 1) & 0b111
    const byteOffset = (packed >>> 4) * 128
    const offsets = offsetsByDataFile.get(dataFileId) ?? []
    offsets.push(byteOffset)
    offsetsByDataFile.set(dataFileId, offsets)
    if (hash === wantedHash) match = { dataFileId, offset: byteOffset }
  }

  if (!match) throw new Error(`The selected install does not contain ${gamePath}.`)
  const nextOffset = offsetsByDataFile
    .get(match.dataFileId)
    ?.reduce<number | undefined>((nearest, candidate) => {
      if (candidate <= match.offset) return nearest
      return nearest === undefined || candidate < nearest ? candidate : nearest
    }, undefined)

  return { ...match, nextOffset }
}

function fallbackFile(source: Extract<AssetSource, { kind: 'local' }>, repository: string, name: string): File | undefined {
  const suffix = `/${repository}/${name}`.toLowerCase()
  const file = source.files?.find((candidate) => {
    const path = candidate.webkitRelativePath.replaceAll('\\', '/').toLowerCase()
    return path === suffix.slice(1) || path.endsWith(suffix)
  })
  return file
}

async function sourceFile(
  source: Extract<AssetSource, { kind: 'local' }>,
  repository: string,
  name: string,
): Promise<File | undefined> {
  if (!source.handle) return fallbackFile(source, repository, name)
  try {
    const repositoryHandle = await source.handle.getDirectoryHandle(repository)
    return await repositoryHandle.getFileHandle(name).then((handle) => handle.getFile())
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') return undefined
    throw error
  }
}

function triples(view: DataView, offset: number): number[] {
  return [view.getUint32(offset, true), view.getUint32(offset + 4, true), view.getUint32(offset + 8, true)]
}

function tripleShorts(view: DataView, offset: number): number[] {
  return [view.getUint16(offset, true), view.getUint16(offset + 2, true), view.getUint16(offset + 4, true)]
}

export function parseModelPayloadHeader(headerBytes: ArrayBuffer): ModelPayloadHeader {
  assertRange(headerBytes.byteLength >= MODEL_HEADER_SIZE, 'The SqPack model header is truncated.')
  const view = new DataView(headerBytes)
  const headerSize = view.getUint32(0, true)
  const kind = view.getUint32(4, true)
  assertRange(kind === 3, `Expected an FFXIV model payload, but SqPack type ${kind} was found.`)
  assertRange(headerSize >= MODEL_HEADER_SIZE && headerSize <= MAX_MODEL_HEADER_SIZE, 'The SqPack model header size is invalid.')
  assertRange(headerBytes.byteLength >= headerSize, 'The SqPack model block table is truncated.')

  const stackOffset = view.getUint32(112, true)
  const runtimeOffset = view.getUint32(116, true)
  const vertexOffsets = triples(view, 120)
  const edgeOffsets = triples(view, 132)
  const indexOffsets = triples(view, 144)
  const stackBlocks = view.getUint16(178, true)
  const runtimeBlocks = view.getUint16(180, true)
  const vertexBlocks = tripleShorts(view, 182)
  const edgeBlocks = tripleShorts(view, 188)
  const indexBlocks = tripleShorts(view, 194)
  const sections: ModelSection[] = [
    { offset: stackOffset, blockCount: stackBlocks },
    { offset: runtimeOffset, blockCount: runtimeBlocks },
  ]
  for (let lod = 0; lod < 3; lod += 1) {
    sections.push(
      { offset: vertexOffsets[lod]!, blockCount: vertexBlocks[lod]! },
      { offset: edgeOffsets[lod]!, blockCount: edgeBlocks[lod]! },
      { offset: indexOffsets[lod]!, blockCount: indexBlocks[lod]! },
    )
  }

  const totalBlocks = sections.reduce((sum, section) => sum + section.blockCount, 0)
  assertRange(totalBlocks <= 4096, 'The SqPack model declares too many compressed blocks.')
  assertRange(MODEL_HEADER_SIZE + totalBlocks * 2 <= headerSize, 'The SqPack model block-size table is truncated.')
  const blockSizes = Array.from({ length: totalBlocks }, (_, index) => view.getUint16(MODEL_HEADER_SIZE + index * 2, true))

  return {
    headerSize,
    version: view.getUint32(20, true),
    vertexDeclarationCount: view.getUint16(200, true),
    materialCount: view.getUint16(202, true),
    lodCount: view.getUint8(204),
    indexBufferStreamingEnabled: view.getUint8(205),
    edgeGeometryEnabled: view.getUint8(206),
    sections,
    blockSizes,
  }
}

function modelRangeSize(header: ModelPayloadHeader): number {
  let blockIndex = 0
  let furthest = header.headerSize
  for (const section of header.sections) {
    let sectionSize = 0
    for (let block = 0; block < section.blockCount; block += 1) {
      sectionSize += header.blockSizes[blockIndex]!
      blockIndex += 1
    }
    furthest = Math.max(furthest, header.headerSize + section.offset + sectionSize)
  }
  assertRange(furthest <= MAX_MODEL_RANGE_SIZE, 'The selected model exceeds the browser decoder safety limit.')
  return furthest
}

async function readModelAtLocation(
  source: Extract<AssetSource, { kind: 'local' }>,
  repository: string,
  gamePath: string,
  location: SqpackLocation,
  getSourceFile = (requestedRepository: string, name: string) => sourceFile(source, requestedRepository, name),
): Promise<ArrayBuffer> {
  const datFile = await getSourceFile(repository, `040000.win32.dat${location.dataFileId}`)
  assertRange(datFile, `The selected directory is missing ${repository}/040000.win32.dat${location.dataFileId}.`)
  assertRange(location.offset + MODEL_HEADER_SIZE <= datFile.size, 'The model offset points beyond its SqPack data file.')

  const prefix = await datFile.slice(location.offset, location.offset + MODEL_HEADER_SIZE).arrayBuffer()
  const declaredHeaderSize = new DataView(prefix).getUint32(0, true)
  assertRange(declaredHeaderSize >= MODEL_HEADER_SIZE && declaredHeaderSize <= MAX_MODEL_HEADER_SIZE, 'The model header size is invalid.')
  const fullHeaderBytes = await datFile.slice(location.offset, location.offset + declaredHeaderSize).arrayBuffer()
  const header = parseModelPayloadHeader(fullHeaderBytes)
  const rangeSize = modelRangeSize(header)
  if (location.nextOffset !== undefined) {
    assertRange(location.offset + rangeSize <= location.nextOffset, 'The model payload overlaps the next SqPack entry.')
  }
  assertRange(location.offset + rangeSize <= datFile.size, 'The model payload extends beyond its SqPack data file.')
  return datFile.slice(location.offset, location.offset + rangeSize).arrayBuffer()
}

export interface LocalModelReader {
  read(gamePath: string): Promise<ArrayBuffer>
}

/** Creates one repository-aware reader and retains only character index tables for this worker batch. */
export function createLocalModelReader(source: Extract<AssetSource, { kind: 'local' }>): LocalModelReader {
  const fileCache = new Map<string, Promise<File | undefined>>()
  const cachedSourceFile = (repository: string, name: string) => {
    const key = `${repository}/${name}`
    let pending = fileCache.get(key)
    if (!pending) {
      pending = sourceFile(source, repository, name)
      fileCache.set(key, pending)
    }
    return pending
  }
  const indexCache = new Map<string, Promise<ArrayBuffer | undefined>>()
  const indexBytes = (repository: string) => {
    let pending = indexCache.get(repository)
    if (!pending) {
      pending = cachedSourceFile(repository, '040000.win32.index2')
        .then((file) => file?.arrayBuffer())
      indexCache.set(repository, pending)
    }
    return pending
  }

  return {
    async read(gamePath: string) {
      for (const repository of CHARACTER_REPOSITORIES) {
        const bytes = await indexBytes(repository)
        if (!bytes) continue
        try {
          const location = locateIndex2Entry(bytes, gamePath)
          return await readModelAtLocation(source, repository, gamePath, location, cachedSourceFile)
        } catch (error) {
          if (error instanceof Error && error.message === `The selected install does not contain ${gamePath}.`) continue
          throw error
        }
      }
      throw new Error(`The selected install does not contain ${gamePath} in ffxiv or ex1–ex5.`)
    },
  }
}

export async function readLocalModelPayload(
  source: Extract<AssetSource, { kind: 'local' }>,
  gamePath: string,
): Promise<ArrayBuffer> {
  return createLocalModelReader(source).read(gamePath)
}
