import type { MaterialColorTable } from './mtrl'
import { TEX_FORMAT, type DecodedTexture } from './tex'

export interface BakedCharacterMaterial {
  diffuse: DecodedTexture
  normal?: DecodedTexture
  ao: DecodedTexture
  roughness: DecodedTexture
  metalness: DecodedTexture
  emissive: DecodedTexture
  specularColor: DecodedTexture
  specularIntensity: DecodedTexture
}

export type MaterialAlphaMode = 'opaque' | 'mask' | 'blend'

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

function srgbToLinear(value: number): number {
  const normalized = Math.min(1, Math.max(0, value / 255))
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4
}

function linearToSrgb(value: number): number {
  const normalized = Math.min(1, Math.max(0, value))
  return normalized <= 0.0031308
    ? normalized * 12.92
    : 1.055 * normalized ** (1 / 2.4) - 0.055
}

function cleanedNormal(texture: DecodedTexture): DecodedTexture {
  const rgba = new Uint8Array(texture.rgba)
  for (let offset = 0; offset < rgba.length; offset += 4) {
    if (texture.format !== TEX_FORMAT.BC5) rgba[offset + 2] = 255
    rgba[offset + 3] = 255
  }
  return { ...texture, rgba }
}

export function materialAlphaMode(shaderPackage: string, materialReference: string, shaderFlags = 0): MaterialAlphaMode {
  const shader = shaderPackage.toLowerCase()
  const face = /mt_c\d{4}f\d{4}/i.test(materialReference)
  // Character hairstyles are layered cutout cards. Their MTRL commonly carries
  // the generic translucency flag (for example 0x1d), but treating that as a
  // conventional blended surface disables depth writes and exposes the scalp
  // between overlapping cards. Face hair remains a blended overlay.
  if (shader === 'hair.shpk') return face ? 'blend' : 'mask'
  if ((shaderFlags & 0x10) !== 0) return 'blend'
  if (shader === 'characterglass.shpk' || shader === 'charactertattoo.shpk') return 'blend'
  if (shader === 'skin.shpk') return face ? 'mask' : 'opaque'
  if (shader === 'character.shpk' || shader === 'characterlegacy.shpk') return 'mask'
  return 'opaque'
}

/** Hair is assembled from open cards whose reverse faces remain visible in-game. */
export function materialRendersBackfaces(
  shaderPackage: string,
  materialReference: string,
  authoredRenderBackfaces: boolean | undefined,
  alphaMode: MaterialAlphaMode,
): boolean {
  const hair = shaderPackage.toLowerCase() === 'hair.shpk' || /_hir_[a-z]\.mtrl$/i.test(materialReference)
  return hair || (authoredRenderBackfaces ?? alphaMode !== 'opaque')
}

/** Preserves the soft overlap between layered hair cards without exposing their full rectangles. */
export function materialAlphaCutoff(
  shaderPackage: string,
  alphaMode: MaterialAlphaMode,
  hasDiffuse: boolean,
): number {
  if (!hasDiffuse || alphaMode !== 'mask') return 0
  return shaderPackage.toLowerCase() === 'hair.shpk' ? 0.15 : 0.46
}

/** Only gear-style shaders interpret a MTRL color table as the character PBR lookup. */
export function usesCharacterColorTable(shaderPackage: string): boolean {
  const shader = shaderPackage.toLowerCase()
  return shader === 'character.shpk'
    || shader === 'characterlegacy.shpk'
    || shader === 'characterstocking.shpk'
    || shader === 'characterstockings.shpk'
}

/** Bakes hair/facial-hair tint and opacity stored across normal and mask textures. */
export function bakeHairMaterial(
  normal: DecodedTexture | undefined,
  mask: DecodedTexture | undefined,
): { diffuse: DecodedTexture; normal: DecodedTexture } | undefined {
  if (!normal || !mask) return undefined
  const rgba = new Uint8Array(normal.width * normal.height * 4)
  // Hair hue belongs to character customization and is multiplied in the
  // renderer. Keep this baked source neutral; a colored ramp leaks that hue
  // into every hairstyle (the old blue highlight caused visible blue locks).
  const base = 184
  const highlight = 255
  for (let y = 0; y < normal.height; y += 1) {
    for (let x = 0; x < normal.width; x += 1) {
      const target = (y * normal.width + x) * 4
      const normalPixel = sample(normal, x, y, normal.width, normal.height)
      const maskPixel = sample(mask, x, y, normal.width, normal.height)
      const tint = normalPixel[2] / 255
      const strength = maskPixel[3] / 255
      const brightness = Math.round((base + (highlight - base) * tint) * strength)
      rgba[target] = rgba[target + 1] = rgba[target + 2] = brightness
      rgba[target + 3] = normalPixel[3]
    }
  }
  return { diffuse: output(normal.width, normal.height, rgba), normal: cleanedNormal(normal) }
}

/** Keeps the iris source neutral so the interactive renderer can apply its selected palette color once. */
export function bakeIrisMaterial(
  diffuse: DecodedTexture | undefined,
  _mask: DecodedTexture | undefined,
): DecodedTexture | undefined {
  return diffuse ? { ...diffuse, rgba: new Uint8Array(diffuse.rgba) } : undefined
}

export function bakeSkinNormal(normal: DecodedTexture | undefined): DecodedTexture | undefined {
  return normal ? cleanedNormal(normal) : undefined
}

/** Skin shaders use normal-map blue as the per-pixel palette-tint influence. */
export function extractSkinColorMask(normal: DecodedTexture | undefined): DecodedTexture | undefined {
  if (!normal || normal.format === TEX_FORMAT.BC5) return undefined
  const rgba = new Uint8Array(normal.rgba.length)
  for (let offset = 0; offset < rgba.length; offset += 4) {
    const influence = normal.rgba[offset + 2]!
    rgba[offset] = rgba[offset + 1] = rgba[offset + 2] = influence
    rgba[offset + 3] = 255
  }
  return output(normal.width, normal.height, rgba)
}

/** Skin FACE mode uses the authored normal alpha channel as its lip mask. */
export function extractSkinLipMask(normal: DecodedTexture | undefined): DecodedTexture | undefined {
  if (!normal) return undefined
  const rgba = new Uint8Array(normal.rgba.length)
  for (let offset = 0; offset < rgba.length; offset += 4) {
    const coverage = normal.rgba[offset + 3]!
    rgba[offset] = rgba[offset + 1] = rgba[offset + 2] = coverage
    rgba[offset + 3] = 255
  }
  return output(normal.width, normal.height, rgba)
}

/**
 * CharacterTattoo has no diffuse sampler. Face paint, scars and makeup use the
 * normal texture's alpha as opacity and receive their color from customization.
 * Use the same neutral default used by model exporters until appearance color
 * controls are exposed by the viewer.
 */
export function bakeTattooMaterial(
  normal: DecodedTexture | undefined,
): { diffuse: DecodedTexture; normal: DecodedTexture } | undefined {
  if (!normal) return undefined
  const rgba = new Uint8Array(normal.rgba.length)
  const tattooColor = [38, 112, 102]
  for (let offset = 0; offset < rgba.length; offset += 4) {
    rgba[offset] = tattooColor[0]!
    rgba[offset + 1] = tattooColor[1]!
    rgba[offset + 2] = tattooColor[2]!
    rgba[offset + 3] = normal.rgba[offset + 3]!
  }
  return {
    diffuse: output(normal.width, normal.height, rgba),
    normal: cleanedNormal(normal),
  }
}

/** Bakes the character shader's colorset/index lookup into standard PBR textures. */
export function bakeCharacterMaterial(
  table: MaterialColorTable,
  textures: {
    diffuse?: DecodedTexture
    normal?: DecodedTexture
    mask?: DecodedTexture
    specular?: DecodedTexture
    index?: DecodedTexture
  },
  shaderPackage = 'character.shpk',
): BakedCharacterMaterial | undefined {
  const shader = shaderPackage.toLowerCase()
  const legacyShader = shader === 'characterlegacy.shpk'
  const selector = table.kind === 'dawntrail' ? textures.index : textures.normal
  if (!selector) return undefined
  const reference = textures.diffuse ?? selector
  const width = reference.width
  const height = reference.height
  const diffuse = new Uint8Array(width * height * 4)
  const ao = new Uint8Array(diffuse.length)
  const roughness = new Uint8Array(diffuse.length)
  const metalness = new Uint8Array(diffuse.length)
  const emissive = new Uint8Array(diffuse.length)
  const specularColor = new Uint8Array(diffuse.length)
  const specularIntensity = new Uint8Array(diffuse.length)

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const target = (y * width + x) * 4
      const selection = sample(selector, x, y, width, height)
      let first: number
      let second: number
      let blend: number
      const base = sample(textures.diffuse, x, y, width, height)
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
      const mask = sample(textures.mask, x, y, width, height)
      const specularBase = sample(textures.specular, x, y, width, height)
      const opacity = textures.normal && textures.normal.format !== TEX_FORMAT.BC5
        ? sample(textures.normal, x, y, width, height)[2] / 255
        : 1
      for (let channel = 0; channel < 3; channel += 1) {
        const tableDiffuse = Math.max(0, mix(a.diffuse[channel]!, b.diffuse[channel]!))
        const tableSpecular = Math.max(0, mix(a.specular[channel]!, b.specular[channel]!))
        diffuse[target + channel] = clampByte(linearToSrgb(tableDiffuse * srgbToLinear(base[channel]!)))
        emissive[target + channel] = clampByte(linearToSrgb(mix(a.emissive[channel]!, b.emissive[channel]!)))
        specularColor[target + channel] = clampByte(linearToSrgb(tableSpecular * srgbToLinear(specularBase[channel]!)))
      }
      const baseAlpha = table.kind === 'dawntrail' ? base[3] / 255 : 1
      diffuse[target + 3] = clampByte(baseAlpha * opacity * 255)
      const rowRoughness = mix(a.roughness, b.roughness)
      // The character mask's green channel is GLOSS (smoothness), not roughness:
      // polished metal is near-white, matte cloth is dark. Reading it directly as
      // roughness inverted every surface — shiny weapons (green ~0.95) baked to
      // 0.95 roughness and rendered as flat matte black. Convert gloss to
      // roughness and trust that per-pixel map when present (it is the authored
      // detail); fall back to the colorset row otherwise. The floor keeps metals
      // from becoming a perfect mirror under Three's sharper microfacet response.
      const textureRoughness = textures.mask
        ? (legacyShader ? 1 - mask[1] / 255 : mask[1] / 255)
        : rowRoughness
      // The colorset/STM roughness is the surface baseline and the mask adds
      // local rough detail. Discarding the row whenever a mask existed also
      // discarded dye roughness, leaving dark dyes with the original garment's
      // saturated glossy reflections (Jet Black looked blue on the Mirage
      // Coatee). Neither source may make the surface smoother than the other.
      const pbrRoughness = Math.max(0.25, rowRoughness, textureRoughness)
      const rough = clampByte(pbrRoughness)
      const occlusion = textures.mask ? mask[2] : 255
      const rowSpecularMask = legacyShader ? mix(a.specularMask, b.specularMask) : 1
      const textureSpecularMask = textures.mask ? (legacyShader ? mask[0] / 255 : 1) : 1
      const specularAlpha = textures.specular ? specularBase[3] / 255 : 1
      const specularStrength = clampByte(rowSpecularMask * textureSpecularMask * specularAlpha)
      ao[target] = ao[target + 1] = ao[target + 2] = occlusion
      roughness[target] = roughness[target + 1] = roughness[target + 2] = rough
      
      // Metalness comes from the colorset row, not the mask. The colorset
      // already distinguishes cloth (metalness ~0) from metal (metalness ~1)
      // per material, and a metallic dye raises this row value — so cloth stays
      // matte by default and only genuine metal (or a metal dye) turns metallic.
      // The Dawntrail mask red channel is NOT metalness: it reads high on plain
      // cloth, which previously baked every garment as polished metal.
      const rowMetalness = mix(a.metalness, b.metalness)
      metalness[target] = metalness[target + 1] = metalness[target + 2] = clampByte(rowMetalness)
      specularIntensity[target] = specularIntensity[target + 1] = specularIntensity[target + 2] = 255
      specularIntensity[target + 3] = specularStrength
      specularColor[target + 3] = 255
      ao[target + 3] = emissive[target + 3] = roughness[target + 3] = metalness[target + 3] = 255
    }
  }

  return {
    diffuse: output(width, height, diffuse),
    normal: textures.normal ? cleanedNormal(textures.normal) : undefined,
    ao: output(width, height, ao),
    roughness: output(width, height, roughness),
    metalness: output(width, height, metalness),
    emissive: output(width, height, emissive),
    specularColor: output(width, height, specularColor),
    specularIntensity: output(width, height, specularIntensity),
  }
}
