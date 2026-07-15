import type { ArmorSlot } from '../catalog/types'
import type { DecodedTexture } from './tex'

export interface MaterialLoadRequest {
  modelPath: string
  materialPaths: string[]
  imcPath?: string
  slot?: ArmorSlot
  variant?: number
}

export interface DecodedMaterial {
  path: string
  shaderPackage: string
  textures: {
    diffuse?: DecodedTexture
    normal?: DecodedTexture
    mask?: DecodedTexture
    specular?: DecodedTexture
  }
}

export interface MaterialLoadResult {
  modelPath: string
  materials: Record<string, DecodedMaterial>
  errors: string[]
}

