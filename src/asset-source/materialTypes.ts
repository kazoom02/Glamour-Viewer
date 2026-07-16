import type { EquipmentSlot } from '../catalog/types'
import type { DecodedTexture } from './tex'
import type { MaterialAlphaMode } from './materialBake'

export interface MaterialLoadRequest {
  modelPath: string
  materialPaths: string[]
  imcPath?: string
  slot?: EquipmentSlot
  variant?: number
  /** In-game Stain row IDs for dye channels 1 and 2. */
  stains?: [number, number]
}

export interface DecodedMaterial {
  path: string
  shaderPackage: string
  alphaMode: MaterialAlphaMode
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
}
