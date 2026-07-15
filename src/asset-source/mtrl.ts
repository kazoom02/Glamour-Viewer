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
}

const SAMPLER_ROLES = new Map<number, TextureRole>([
  [0x115306be, 'diffuse'],
  [0x0c5ec1f1, 'normal'],
  [0x8a4e82b6, 'mask'],
  [0x2b99e025, 'specular'],
  [0x565f8fd8, 'index'],
  [0x2005679f, 'table'],
])

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

  let cursor = stringEnd + additionalDataSize + dataSetSize
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
  return { version, shaderPackage, textures }
}
