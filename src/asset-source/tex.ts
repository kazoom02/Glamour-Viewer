import { decodeBC1, decodeBC2, decodeBC3, decodeBC4, decodeBC5, decodeBC7 } from '@bis-toolkit/bcn'

const TEX_HEADER_SIZE = 80
const MAX_PIXELS = 4096 * 4096

export const TEX_FORMAT = {
  L8: 0x1130,
  A8: 0x1131,
  B4G4R4A4: 0x1440,
  B5G5R5A1: 0x1441,
  B8G8R8A8: 0x1450,
  B8G8R8X8: 0x1451,
  BC1: 0x3420,
  BC2: 0x3430,
  BC3: 0x3431,
  BC4: 0x6120,
  BC5: 0x6230,
  BC7: 0x6432,
} as const

export interface DecodedTexture {
  width: number
  height: number
  format: number
  rgba: Uint8Array
}

function assertRange(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function reconstructNormalZ(rgba: Uint8Array) {
  for (let offset = 0; offset < rgba.length; offset += 4) {
    const x = rgba[offset]! / 127.5 - 1
    const y = rgba[offset + 1]! / 127.5 - 1
    rgba[offset + 2] = Math.round((Math.sqrt(Math.max(0, 1 - x * x - y * y)) * 0.5 + 0.5) * 255)
    rgba[offset + 3] = 255
  }
}

function decodeUncompressed(data: DataView, format: number, pixelCount: number): Uint8Array {
  const rgba = new Uint8Array(pixelCount * 4)
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const target = pixel * 4
    if (format === TEX_FORMAT.L8 || format === TEX_FORMAT.A8) {
      const value = data.getUint8(pixel)
      rgba[target] = rgba[target + 1] = rgba[target + 2] = format === TEX_FORMAT.L8 ? value : 255
      rgba[target + 3] = format === TEX_FORMAT.A8 ? value : 255
    } else if (format === TEX_FORMAT.B4G4R4A4) {
      const value = data.getUint16(pixel * 2, true)
      rgba[target] = ((value >>> 8) & 0xf) * 17
      rgba[target + 1] = ((value >>> 4) & 0xf) * 17
      rgba[target + 2] = (value & 0xf) * 17
      rgba[target + 3] = ((value >>> 12) & 0xf) * 17
    } else if (format === TEX_FORMAT.B5G5R5A1) {
      const value = data.getUint16(pixel * 2, true)
      rgba[target] = Math.round(((value >>> 10) & 0x1f) * 255 / 31)
      rgba[target + 1] = Math.round(((value >>> 5) & 0x1f) * 255 / 31)
      rgba[target + 2] = Math.round((value & 0x1f) * 255 / 31)
      rgba[target + 3] = value & 0x8000 ? 255 : 0
    } else {
      const source = pixel * 4
      rgba[target] = data.getUint8(source + 2)
      rgba[target + 1] = data.getUint8(source + 1)
      rgba[target + 2] = data.getUint8(source)
      rgba[target + 3] = format === TEX_FORMAT.B8G8R8X8 ? 255 : data.getUint8(source + 3)
    }
  }
  return rgba
}

/** Decodes the highest-resolution surface of a raw FFXIV TEX file to browser RGBA. */
export function decodeTex(bytes: ArrayBuffer): DecodedTexture {
  assertRange(bytes.byteLength >= TEX_HEADER_SIZE, 'The TEX header is truncated.')
  const header = new DataView(bytes)
  const format = header.getUint32(4, true)
  const width = header.getUint16(8, true)
  const height = header.getUint16(10, true)
  const arraySize = Math.max(1, header.getUint8(15))
  const surfaceOffset = header.getUint32(28, true) || TEX_HEADER_SIZE
  const pixelCount = width * height
  assertRange(width > 0 && height > 0 && pixelCount <= MAX_PIXELS, `Unsupported TEX dimensions ${width}x${height}.`)
  assertRange(arraySize === 1, 'Array and cube TEX files are not supported by the character material decoder.')
  assertRange(surfaceOffset < bytes.byteLength, 'The TEX surface offset is outside the file.')
  const data = new DataView(bytes, surfaceOffset)
  let rgba: Uint8Array
  switch (format) {
    case TEX_FORMAT.BC1: rgba = decodeBC1(data, width, height, true); break
    case TEX_FORMAT.BC2: rgba = decodeBC2(data, width, height); break
    case TEX_FORMAT.BC3: rgba = decodeBC3(data, width, height); break
    case TEX_FORMAT.BC4: rgba = decodeBC4(data, width, height); break
    case TEX_FORMAT.BC5:
      rgba = decodeBC5(data, width, height)
      reconstructNormalZ(rgba)
      break
    case TEX_FORMAT.BC7: rgba = decodeBC7(data, width, height); break
    case TEX_FORMAT.L8:
    case TEX_FORMAT.A8:
    case TEX_FORMAT.B4G4R4A4:
    case TEX_FORMAT.B5G5R5A1:
    case TEX_FORMAT.B8G8R8A8:
    case TEX_FORMAT.B8G8R8X8:
      rgba = decodeUncompressed(data, format, pixelCount)
      break
    default: throw new Error(`Unsupported FFXIV TEX format 0x${format.toString(16)}.`)
  }
  assertRange(rgba.byteLength === pixelCount * 4, `TEX decoder produced ${rgba.byteLength} bytes; expected ${pixelCount * 4}.`)
  return { width, height, format, rgba }
}

