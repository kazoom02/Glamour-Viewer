import type { EquipmentSlot } from '../catalog/types'
import type { DecodedTexture } from './tex'
import type { MaterialAlphaMode } from './materialBake'
import type { DecodedAvfx } from './avfx'

export interface MaterialLoadRequest {
  modelPath: string
  materialPaths: string[]
  imcPath?: string
  slot?: EquipmentSlot
  variant?: number
  /** In-game Stain row IDs for dye channels 1 and 2. */
  stains?: [number, number]
  equipmentSetId?: number
  /** CharaMake face-paint FeatureID; zero disables the decal. */
  facePaintId?: number
}

export interface DecodedMaterial {
  path: string
  shaderPackage: string
  alphaMode: MaterialAlphaMode
  renderBackfaces: boolean
  shaderFlags: number
  textures: {
    diffuse?: DecodedTexture
    normal?: DecodedTexture
    mask?: DecodedTexture
    specular?: DecodedTexture
    index?: DecodedTexture
    ao?: DecodedTexture
    roughness?: DecodedTexture
    metalness?: DecodedTexture
    emissive?: DecodedTexture
    specularColor?: DecodedTexture
    specularIntensity?: DecodedTexture
    /** Skin shader tint influence copied from the authored normal blue channel. */
    skinColorMask?: DecodedTexture
    /** Skin FACE mode: alpha copied from the authored normal map. */
    lipMask?: DecodedTexture
  }
  colorTableRows?: number
  dyeableRows?: number
}

export interface MaterialLoadResult {
  modelPath: string
  materials: Record<string, DecodedMaterial>
  errors: string[]
  diagnostics: string[]
  attributeMask?: number
  /** Equipment effect selected by the active IMC row. Zero means no AVFX. */
  vfxId?: number
  /** Equipment material animation selected by the active IMC row. */
  materialAnimationId?: number
  /** Resolved game path for the selected equipment AVFX, when known. */
  vfxPath?: string
  /** Decoded textures in the AVFX texture-table order. */
  vfxTextures?: Array<{ path: string; texture: DecodedTexture }>
  /** Authored AVFX scheduler, emitters, particles, curves, and embedded meshes. */
  vfx?: DecodedAvfx
  /** Local face decal decoded from chara/common/texture/decal_face. */
  facePaintTexture?: { path: string; texture: DecodedTexture }
  headHairHidden?: boolean
  headScalpHidden?: boolean
}
