import type { MaterialColorTable } from './mtrl'
import { TEX_FORMAT, type DecodedTexture } from './tex'

export interface BakedCharacterMaterial {
  diffuse: DecodedTexture
  normal?: DecodedTexture
  roughness: DecodedTexture
  metalness: DecodedTexture
  emissive: DecodedTexture
}

function clampByte(value: number): number {
  return Math.round(Math.min(1, Math.max(0, value)) * 255)
}

function sample(texture: DecodedTexture | undefined, x: number, y: number, width: number, height: number): [number, number, number, number] {
  if (!texture) return [255, 255, 255, 255]
  const sx = Math.min(texture.width - 1, Math.floor(x * texture.width / width))
  const sy = Math.min(texture.height - 1, Math.floor(y * texture.height / height))
  const offset = (sy * texture.width + sx) * 4
  return [texture.rgba[offset]!, texture.rgba[offset + 1]!, texture.rgba[offset + 2]!, texture.rgba[offset + 3]!]
}

function output(width: number, height: number, rgba: Uint8Array): DecodedTexture {
  return { width, height, format: TEX_FORMAT.B8G8R8A8, rgba }
}

function pseudoSqrt(value: number): number {
  return value < 0 ? -Math.sqrt(-value) : Math.sqrt(value)
}

/** Bakes the character shader's colorset/index lookup into standard PBR textures. */
export function bakeCharacterMaterial(
  table: MaterialColorTable,
  textures: {
    diffuse?: DecodedTexture
    normal?: DecodedTexture
    mask?: DecodedTexture
    index?: DecodedTexture
  },
): BakedCharacterMaterial | undefined {
  const selector = table.kind === 'dawntrail' ? textures.index : textures.normal
  if (!selector) return undefined
  const reference = textures.diffuse ?? selector
  const width = reference.width
  const height = reference.height
  const diffuse = new Uint8Array(width * height * 4)
  const roughness = new Uint8Array(diffuse.length)
  const metalness = new Uint8Array(diffuse.length)
  const emissive = new Uint8Array(diffuse.length)
  const normal = textures.normal ? new Uint8Array(textures.normal.rgba) : undefined

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const target = (y * width + x) * 4
      const selection = sample(selector, x, y, width, height)
      let first: number
      let second: number
      let blend: number
      if (table.kind === 'dawntrail') {
        const pair = Math.min(15, Math.round(selection[0] / 17))
        first = Math.min(table.rows.length - 1, pair * 2)
        second = Math.min(table.rows.length - 1, first + 1)
        blend = 1 - selection[1] / 255
      } else {
        first = second = Math.min(table.rows.length - 1, Math.round(selection[3] / 17))
        blend = 0
      }
      const a = table.rows[first]!
      const b = table.rows[second]!
      const mix = (left: number, right: number) => left + (right - left) * blend
      const base = sample(textures.diffuse, x, y, width, height)
      const mask = sample(textures.mask, x, y, width, height)
      const opacity = textures.normal && textures.normal.format !== TEX_FORMAT.BC5
        ? sample(textures.normal, x, y, width, height)[2] / 255
        : 1
      for (let channel = 0; channel < 3; channel += 1) {
        const tableColor = pseudoSqrt(mix(a.diffuse[channel]!, b.diffuse[channel]!))
        diffuse[target + channel] = clampByte(tableColor * (base[channel]! / 255) * (mask[2] / 255))
        emissive[target + channel] = clampByte(pseudoSqrt(mix(a.emissive[channel]!, b.emissive[channel]!)))
      }
      diffuse[target + 3] = clampByte((base[3] / 255) * opacity)
      const rowRoughness = mix(a.roughness, b.roughness)
      const rowMetalness = mix(a.metalness, b.metalness)
      const rough = clampByte(rowRoughness * (textures.mask ? mask[1] / 255 : 1))
      const metal = clampByte(rowMetalness)
      roughness[target] = roughness[target + 1] = roughness[target + 2] = rough
      metalness[target] = metalness[target + 1] = metalness[target + 2] = metal
      emissive[target + 3] = roughness[target + 3] = metalness[target + 3] = 255
    }
  }

  if (normal) {
    for (let offset = 0; offset < normal.length; offset += 4) {
      if (textures.normal!.format !== TEX_FORMAT.BC5) normal[offset + 2] = 255
      normal[offset + 3] = 255
    }
  }
  return {
    diffuse: output(width, height, diffuse),
    normal: normal ? { ...textures.normal!, rgba: normal } : undefined,
    roughness: output(width, height, roughness),
    metalness: output(width, height, metalness),
    emissive: output(width, height, emissive),
  }
}
