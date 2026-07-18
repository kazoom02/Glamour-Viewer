import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import type { AssetSource } from '../asset-source/types'
import {
  auxiliarySkeletonPlan,
  characterModelCandidates,
  characterModelPlan,
  equipmentModelCandidates,
  faceSkeletonCandidates,
  idleAnimationCandidates,
  skeletonPath,
  weaponRaceScale,
  type CharacterPart,
  type CharacterRaceCode,
} from '../asset-source/characterPlan'
import { loadLocalAnimation, loadLocalIdleAnimation, type DecodedAnimation } from '../asset-source/animationLoader'
import { catalogAnimationCandidates, type CatalogAnimation } from '../asset-source/animationCatalog'
import { createLocalAssetReader } from '../asset-source/sqpack'
import { HUMAN_CMP_PATH, loadLocalBustScale, type BustScale } from '../asset-source/cmp'
import { equipmentAssetPlan } from '../asset-source/equipmentPlan'
import {
  loadLocalMaterials,
  type DecodedMaterialAnimation,
  type DecodedMaterialAnimationTrack,
  type DecodedMaterial,
  type MaterialLoadRequest,
  type MaterialLoadResult,
} from '../asset-source/materialLoader'
import { materialAnimationTrack, sampleMaterialAnimationTrack } from '../asset-source/materialAnimation'
import { loadLocalModels, type ModelLoadResult } from '../asset-source/modelLoader'
import type { DecodedModel } from '../asset-source/mdl'
import {
  isMissingLocalSkeletonError,
  loadLocalHairSkeleton,
  loadLocalSkeleton,
  type DecodedSkeleton,
} from '../asset-source/skeletonLoader'
import { attachSkeleton } from '../asset-source/sklb'
import {
  EQUIPMENT_SLOTS,
  isWeaponSlot,
  type ArmorItem,
  type EquipmentSlot,
  type EquippedArmor,
  type WeaponPlacement,
} from '../catalog/types'
import type { CharacterCustomization } from '../customization/types'
import { activeFaceShapes, faceFeatureMask, faceFeatureVisible } from '../customization/faceShapes'
import { animationClipFromDecoded } from './idleAnimation'
import AnimationPicker from './AnimationPicker'
import { createAvfxRuntime, type AvfxRuntime } from './avfxRuntime'
import { subdivideCurvedMesh } from './geometryQuality'
import {
  applyBustDeformation,
  bustWeightSummary,
  isBustBoneName,
  muscleNormalStrength,
  type BustDeformationResult,
} from './bodyCustomization'

interface ViewerCanvasProps {
  source: AssetSource
  equipped: EquippedArmor
  raceCode: CharacterRaceCode
  customization: CharacterCustomization
}

const SLOT_COLORS: Record<EquipmentSlot, number> = {
  mainHand: 0x9f895e,
  offHand: 0x8e8065,
  head: 0xd5b36f,
  body: 0xa6804f,
  hands: 0x8f7557,
  legs: 0x7a6651,
  feet: 0x63584b,
  ears: 0xc7aa73,
  neck: 0xb99b67,
  wrists: 0xa88c60,
  rightRing: 0xd2b77c,
  leftRing: 0xd2b77c,
}

const PART_COLORS: Record<CharacterPart, number> = {
  torso: 0xc99378,
  hands: 0xc99378,
  legs: 0xc99378,
  feet: 0xc99378,
  face: 0xd5a087,
  hair: 0x352a2b,
  tail: 0x4b3837,
  ears: 0x3d3031,
}

function addFallbackMannequin(scene: THREE.Scene): THREE.Group {
  const group = new THREE.Group()
  group.name = 'loading-mannequin'
  const material = new THREE.MeshStandardMaterial({
    color: 0x5d6065, roughness: 0.88, transparent: true, opacity: 0.25, depthWrite: false,
  })
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.8, 6, 18), material)
  body.position.y = 1.05
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 20, 16), material)
  head.position.y = 1.75
  const limbGeometry = new THREE.CapsuleGeometry(0.075, 0.65, 5, 12)
  const limbs = [
    [-0.37, 1.05, -0.1], [0.37, 1.05, 0.1], [-0.13, 0.06, 0], [0.13, 0.06, 0],
  ].map(([x, y, rotation]) => {
    const limb = new THREE.Mesh(limbGeometry, material)
    limb.position.set(x!, y!, 0)
    limb.rotation.z = rotation!
    return limb
  })
  group.add(body, head, ...limbs)
  scene.add(group)
  return group
}

function textureFromDecoded(
  texture: NonNullable<DecodedMaterial['textures']['diffuse']>,
  color: boolean,
  anisotropy: number,
): THREE.DataTexture {
  const result = new THREE.DataTexture(texture.rgba, texture.width, texture.height, THREE.RGBAFormat, THREE.UnsignedByteType)
  result.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace
  result.wrapS = THREE.RepeatWrapping
  result.wrapT = THREE.RepeatWrapping
  result.magFilter = THREE.LinearFilter
  result.minFilter = THREE.LinearMipmapLinearFilter
  result.generateMipmaps = true
  result.anisotropy = anisotropy
  result.flipY = false
  result.needsUpdate = true
  return result
}

function textureFromChannel(
  texture: NonNullable<DecodedMaterial['textures']['mask']>,
  channel: 0 | 1 | 2 | 3,
  outputChannel: 'rgb' | 'alpha',
  anisotropy: number,
): THREE.DataTexture {
  const rgba = new Uint8Array(texture.rgba.length)
  for (let offset = 0; offset < rgba.length; offset += 4) {
    const value = texture.rgba[offset + channel]!
    if (outputChannel === 'rgb') {
      rgba[offset] = rgba[offset + 1] = rgba[offset + 2] = value
      rgba[offset + 3] = 255
    } else {
      rgba[offset] = rgba[offset + 1] = rgba[offset + 2] = 255
      rgba[offset + 3] = value
    }
  }
  return textureFromDecoded({ ...texture, rgba }, false, anisotropy)
}

interface CharacterRig {
  skeleton: THREE.Skeleton
  boneIndex: Map<string, number>
}

type IdleAnimationState = 'loading' | 'ready' | 'playing' | 'paused' | 'unavailable'

interface AnimatedMaterial {
  material: THREE.MeshPhysicalMaterial
  animation: DecodedMaterialAnimation
  track: DecodedMaterialAnimationTrack
  color: [number, number, number]
}

function hasVisibleRgb(texture: NonNullable<DecodedMaterial['textures']['emissive']>): boolean {
  const pixelCount = texture.width * texture.height
  const stride = Math.max(1, Math.floor(pixelCount / 8_192))
  for (let pixel = 0; pixel < pixelCount; pixel += stride) {
    const offset = pixel * 4
    if (texture.rgba[offset]! > 4 || texture.rgba[offset + 1]! > 4 || texture.rgba[offset + 2]! > 4) return true
  }
  return false
}

function addCharacterRig(target: THREE.Group, decoded: DecodedSkeleton, bustScale: BustScale = [1, 1, 1]): CharacterRig {
  const bones = decoded.bones.map((source) => {
    const bone = new THREE.Bone()
    bone.name = source.name
    bone.position.fromArray(source.translation)
    bone.quaternion.fromArray(source.rotation).normalize()
    bone.scale.fromArray(source.scale)
    if (source.isAuxiliary) bone.userData.isAuxiliary = true
    return bone
  })
  decoded.bones.forEach((source, index) => {
    const bone = bones[index]!
    const parent = bones[source.parentIndex]
    if (source.parentIndex >= 0 && parent) parent.add(bone)
    else target.add(bone)
  })
  target.updateMatrixWorld(true)
  const skeleton = new THREE.Skeleton(bones)
  skeleton.calculateInverses()
  // Keep the inverse bind matrices from the authored neutral pose, then apply
  // the client RSP scale so j_mune-weighted vertices actually deform.
  bones.forEach((bone) => {
    if (isBustBoneName(bone.name)) bone.scale.multiply(new THREE.Vector3(...bustScale))
  })
  target.updateMatrixWorld(true)
  return { skeleton, boneIndex: new Map(bones.map((bone, index) => [bone.name, index])) }
}

function bustRigDiagnostic(rig: CharacterRig | undefined, stage: string, requested: BustScale): string {
  const bones = rig?.skeleton.bones.filter((bone) => isBustBoneName(bone.name)) ?? []
  const values = bones.map((bone) => (
    `${bone.name}@${rig!.boneIndex.get(bone.name) ?? '?'} scale=${bone.scale.toArray().map((value) => value.toFixed(4)).join(',')}`
  ))
  return `bust rig ${stage}: requestedScale=${requested.map((value) => value.toFixed(4)).join(',')} detectedBones=${bones.length}${values.length ? ` ${values.join(' | ')}` : ' none'}`
}

function neutralizeBustRig(rig: CharacterRig, appliedScale: BustScale): void {
  const safeScale = appliedScale.map((value) => value || 1) as BustScale
  rig.skeleton.bones.forEach((bone) => {
    if (!isBustBoneName(bone.name)) return
    bone.scale.set(
      bone.scale.x / safeScale[0],
      bone.scale.y / safeScale[1],
      bone.scale.z / safeScale[2],
    )
  })
  rig.skeleton.bones.forEach((bone) => bone.updateWorldMatrix(true, false))
  rig.skeleton.update()
}

function bustModelDiagnostic(label: string, path: string, model: DecodedModel): string {
  const summary = bustWeightSummary(model)
  const boundsSize = model.bounds.max.map((value, axis) => value - model.bounds.min[axis]!)
  const raceDeformation = model.deformation
    ? `PBD c${model.deformation.sourceRaceCode.toString().padStart(4, '0')}→c${model.deformation.targetRaceCode.toString().padStart(4, '0')} vertices=${model.deformation.vertices} normals=${model.deformation.normals}`
    : 'native'
  return [
    `bust trace v3 ${label}: path=${path}`,
    `  source=${raceDeformation} lod=${model.lod ?? 'unknown'} meshes=${model.meshes.length}`,
    `  modelBounds min=${formatVector(model.bounds.min)} max=${formatVector(model.bounds.max)} size=${formatVector(boundsSize)}`,
    `  modelBones=${summary.modelBones.join(',') || 'none'} weightedVertices=${summary.weightedVertices} totalWeight=${summary.totalWeight.toFixed(6)} maxVertexWeight=${summary.maximumWeight.toFixed(6)}`,
  ].join('\n')
}

function formatVector(values: readonly number[], digits = 6): string {
  return `[${values.map((value) => Number.isFinite(value) ? value.toFixed(digits) : String(value)).join(',')}]`
}

function bustDeformationDiagnostic(label: string, result: BustDeformationResult): string {
  const maximum = result.maximumVertex
  return [
    `bust deformation v3 ${label}: mode=CPU-weighted transformSpace=${result.transformSpace} weightedVertices=${result.weightedVertices} vertexBuffers=${result.uniqueVertexBuffers}`,
    `  topology affectedTriangles=${result.affectedTriangles}/${result.totalTriangles}`,
    `  beforeBounds min=${formatVector(result.beforeBounds.min)} max=${formatVector(result.beforeBounds.max)} size=${formatVector(result.beforeBounds.size)} center=${formatVector(result.beforeBounds.center)}`,
    `  afterBounds min=${formatVector(result.afterBounds.min)} max=${formatVector(result.afterBounds.max)} size=${formatVector(result.afterBounds.size)} center=${formatVector(result.afterBounds.center)}`,
    `  displacement averageVector=${formatVector(result.averageDisplacement)} averageDistance=${result.averageDistance.toFixed(6)} maximumDistance=${result.maximumDisplacement.toFixed(6)}`,
    maximum
      ? `  maximumVertex mesh=${maximum.meshIndex} vertex=${maximum.vertexIndex} original=${formatVector(maximum.original)} deformed=${formatVector(maximum.deformed)} delta=${formatVector(maximum.displacement)} bustWeight=${maximum.bustWeight.toFixed(6)} influences=${maximum.influences.join(',')}`
      : '  maximumVertex none',
    ...result.bones.map((bone) => bone.mapped
      ? `  bone ${bone.name}: modelIndex=${bone.modelIndex} rigIndex=${bone.rigIndex} parent=${bone.parentName ?? 'none'} localPosition=${formatVector(bone.localPosition!)} bindWorldPosition=${formatVector(bone.bindWorldPosition!)} currentWorldPosition=${formatVector(bone.currentWorldPosition!)} localScale=${formatVector(bone.localScale!)} deltaScale=${formatVector(bone.deltaScale!)} determinant=${bone.transformDeterminant!.toFixed(8)}`
      : `  bone ${bone.name}: modelIndex=${bone.modelIndex} rigIndex=${bone.rigIndex ?? 'missing'} mapped=false`),
  ].join('\n')
}

function colorNumber(value: string, fallback = 0xffffff): number {
  return /^#[0-9a-f]{6}$/i.test(value) ? Number.parseInt(value.slice(1), 16) : fallback
}

// Applies the current appearance colors (hair/eye/skin/lip/tattoo/face paint) to
// one already-built material. Collected per character material so a color change
// updates the live materials in place instead of rebuilding the whole character.
type CustomizationApplier = (customization: CharacterCustomization) => void

interface MaterialCustomizationOptions {
  paletteMask?: DecodedMaterial['textures']['skinColorMask']
  paletteColor?: string
  lipMask?: DecodedMaterial['textures']['lipMask']
  lipColor?: string
  facePaintTexture?: MaterialLoadResult['facePaintTexture']
  facePaintColor?: string
}

function enableMaterialCustomization(
  material: THREE.MeshPhysicalMaterial,
  options: MaterialCustomizationOptions,
  anisotropy: number,
): void {
  const paletteMap = options.paletteMask ? textureFromDecoded(options.paletteMask, false, anisotropy) : undefined
  const lipMap = options.lipMask ? textureFromDecoded(options.lipMask, false, anisotropy) : undefined
  const facePaintMap = options.facePaintTexture ? textureFromDecoded(options.facePaintTexture.texture, false, anisotropy) : undefined
  const paletteTint = new THREE.Color(colorNumber(options.paletteColor ?? '#ffffff'))
  const lipTint = new THREE.Color(colorNumber(options.lipColor ?? '#ffffff'))
  const facePaintTint = new THREE.Color(colorNumber(options.facePaintColor ?? '#ffffff'))
  if (paletteMap) material.userData.paletteMaskMap = paletteMap
  if (lipMap) material.userData.lipMaskMap = lipMap
  if (facePaintMap) material.userData.facePaintMap = facePaintMap
  // Keep references to the live uniform tint colors so a later color change can
  // mutate them in place (the shader uniforms hold these Color objects by
  // reference) without recompiling or rebuilding the material.
  if (paletteMap) material.userData.paletteTintColor = paletteTint
  if (lipMap) material.userData.lipTintColor = lipTint
  if (facePaintMap) material.userData.facePaintTintColor = facePaintTint
  material.onBeforeCompile = (shader) => {
    const vertexDeclarations: string[] = []
    const vertexAssignments: string[] = []
    const fragmentDeclarations: string[] = []
    const fragmentEffects: string[] = []
    if (paletteMap) {
      shader.uniforms.paletteMaskMap = { value: paletteMap }
      shader.uniforms.paletteTint = { value: paletteTint }
      vertexDeclarations.push('varying vec2 vPaletteUv;')
      vertexAssignments.push('vPaletteUv = uv;')
      fragmentDeclarations.push('uniform sampler2D paletteMaskMap; uniform vec3 paletteTint; varying vec2 vPaletteUv;')
      fragmentEffects.push('float paletteCoverage = texture2D(paletteMaskMap, vPaletteUv).r; diffuseColor.rgb *= mix(vec3(1.0), paletteTint, clamp(paletteCoverage, 0.0, 1.0));')
    }
    if (lipMap) {
      shader.uniforms.lipMaskMap = { value: lipMap }
      shader.uniforms.lipColor = { value: lipTint }
      vertexDeclarations.push('varying vec2 vFaceBaseUv;')
      vertexAssignments.push('vFaceBaseUv = uv;')
      fragmentDeclarations.push('uniform sampler2D lipMaskMap; uniform vec3 lipColor; varying vec2 vFaceBaseUv;')
      fragmentEffects.push('float lipCoverage = texture2D(lipMaskMap, vFaceBaseUv).r; diffuseColor.rgb = mix(diffuseColor.rgb, lipColor, clamp(lipCoverage, 0.0, 1.0));')
    }
    if (facePaintMap) {
      shader.uniforms.facePaintMap = { value: facePaintMap }
      shader.uniforms.facePaintColor = { value: facePaintTint }
      vertexDeclarations.push('attribute vec2 facePaintUv; varying vec2 vFacePaintUv;')
      vertexAssignments.push('vFacePaintUv = facePaintUv;')
      fragmentDeclarations.push('uniform sampler2D facePaintMap; uniform vec3 facePaintColor; varying vec2 vFacePaintUv;')
      fragmentEffects.push('float facePaintCoverage = texture2D(facePaintMap, vFacePaintUv).r; diffuseColor.rgb = mix(diffuseColor.rgb, facePaintColor, clamp(facePaintCoverage, 0.0, 1.0));')
    }
    shader.vertexShader = shader.vertexShader.replace(
      'void main() {',
      `${vertexDeclarations.join(' ')} void main() { ${vertexAssignments.join(' ')}`,
    )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        'void main() {',
        `${fragmentDeclarations.join(' ')} void main() {`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>\n${fragmentEffects.join('\n')}`,
      )
  }
  material.customProgramCacheKey = () => `ffxiv-material-customization-v3-${paletteMap ? 'palette' : ''}-${lipMap ? 'lip' : ''}-${facePaintMap ? 'paint' : ''}`
  material.needsUpdate = true
}

function addDecodedModel(
  target: THREE.Object3D,
  model: DecodedModel,
  color: number,
  label: string,
  decodedMaterials: Record<string, DecodedMaterial> = {},
  attributeMask?: number,
  slot?: EquipmentSlot,
  rig?: CharacterRig,
  anisotropy = 1,
  customization?: CharacterCustomization,
  refineCurvature = false,
  materialAnimation?: DecodedMaterialAnimation,
  animatedMaterials: AnimatedMaterial[] = [],
  facePaintTexture?: MaterialLoadResult['facePaintTexture'],
  customizationAppliers: CustomizationApplier[] = [],
): number {
  for (const [index, part] of model.meshes.entries()) {
    if (slot && attributeMask !== undefined && !isVisibleEquipmentPart(part.attributes, slot, attributeMask)) continue
    if (label === 'character-face' && customization && !faceFeatureVisible(part.attributes, faceFeatureMask(customization))) continue
    const renderPart = refineCurvature ? subdivideCurvedMesh(part) : part
    const materialPath = model.materialPaths[part.materialIndex]?.toLowerCase() ?? ''
    const decodedMaterial = decodedMaterials[materialPath.replaceAll('\\', '/')]
    const shaderPackage = decodedMaterial?.shaderPackage.toLowerCase() ?? ''
    // The game's eye-occlusion shader is a multiply/shadow pass. Rendering it as
    // an opaque standard material covers the correctly textured iris in white.
    if (shaderPackage === 'characterocclusion.shpk') continue
    let meshColor = color
    if (/b0001_[a-z]\.mtrl$/.test(materialPath) || /_fac_[a-z]\.mtrl$/.test(materialPath)) meshColor = 0xc99378
    else if (/_iri_[a-z]\.mtrl$/.test(materialPath)) meshColor = 0x6689a7
    else if (/_etc_[a-z]\.mtrl$/.test(materialPath)) meshColor = 0xe7ded2
    else if (/_hir_[a-z]\.mtrl$/.test(materialPath)) meshColor = 0x352a2b
    else if (/_acc_[a-z]\.mtrl$/.test(materialPath)) meshColor = 0x8b6a45
    else if (/e0000_(top|dwn|sho|glv)_/.test(materialPath)) meshColor = 0x554b49
    const diffuse = decodedMaterial?.textures.diffuse
    // Face ETC layers are procedural (tattoo/makeup or facial hair). Rendering
    // an undecoded layer with Three's white fallback creates opaque white masks.
    if (/_etc_[a-z]\.mtrl$/.test(materialPath) && !diffuse) continue
    const normal = decodedMaterial?.textures.normal
    const mask = decodedMaterial?.textures.mask
    const ao = decodedMaterial?.textures.ao
    const roughness = decodedMaterial?.textures.roughness
    const metalness = decodedMaterial?.textures.metalness
    const emissive = decodedMaterial?.textures.emissive
    const specularColor = decodedMaterial?.textures.specularColor ?? decodedMaterial?.textures.specular
    const specularIntensity = decodedMaterial?.textures.specularIntensity
    const alphaMode = decodedMaterial?.alphaMode ?? 'opaque'
    const isIris = decodedMaterial?.shaderPackage.toLowerCase() === 'iris.shpk' || /_iri_[a-z]\.mtrl$/.test(materialPath)
    const isFaceMaterial = /mt_c\d{4}f\d{4}/.test(materialPath)
    // Which appearance color drives this material's tint. Resolved once so the
    // initial build and the live color updates stay in lockstep.
    let tintKind: 'iris' | 'hair' | 'faceOverlay' | 'skin' | 'none' = 'none'
    if (customization) {
      if (isIris) tintKind = 'iris'
      else if (/_hir_[a-z]\.mtrl$/.test(materialPath) || shaderPackage === 'hair.shpk') tintKind = 'hair'
      else if (shaderPackage.includes('tattoo') || /_etc_[a-z]\.mtrl$/.test(materialPath)) tintKind = 'faceOverlay'
      else if (shaderPackage === 'skin.shpk' || /b0001_[a-z]\.mtrl$/.test(materialPath) || isFaceMaterial) tintKind = 'skin'
    }
    const tintFor = (values: CharacterCustomization): number => {
      switch (tintKind) {
        case 'iris': return colorNumber(values.eyeColor)
        case 'hair': return colorNumber(values.hairColor)
        case 'faceOverlay': return colorNumber(values.facePaint ? values.facePaintColor : values.tattooColor)
        case 'skin': return colorNumber(values.skinColor)
        default: return 0xffffff
      }
    }
    const materialTint = customization ? tintFor(customization) : 0xffffff
    const fallbackRoughness = shaderPackage === 'skin.shpk'
      ? 0.76
      : shaderPackage === 'hair.shpk'
        ? 0.72
        : shaderPackage === 'iris.shpk'
          ? 0.46
          : 0.74
    const fallbackSpecularIntensity = shaderPackage === 'skin.shpk'
      ? 0.32
      : shaderPackage === 'hair.shpk'
        ? 0.2
        : shaderPackage === 'iris.shpk'
          ? 0.52
          : 0.28
    // Solid gear shaders (armor, weapons) are FFXIV's colored-specular "metal".
    // Three's dielectric reflectance is far weaker, so lift these two toward a
    // glossy response; face overlays (tattoo/occlusion) keep the subtle value.
    const isGearShader = shaderPackage === 'character.shpk' || shaderPackage === 'characterlegacy.shpk'
    const mappedSpecularIntensity = shaderPackage === 'skin.shpk'
      ? 0.25
      : shaderPackage === 'hair.shpk'
        ? 0.28
        : shaderPackage === 'iris.shpk'
          ? 0.72
          : isGearShader
            ? 0.9
            : shaderPackage.startsWith('character')
              ? 0.38
              : 0.32
    const resolvedMuscleNormalStrength = customization
      && shaderPackage === 'skin.shpk'
      && !isFaceMaterial
      ? muscleNormalStrength(customization.muscleTone)
      : 1
    // Skin tints only the skin-masked pixels via the palette shader. The iris is
    // NOT palette-masked: its baked diffuse is kept neutral, and the iris mask's
    // red channel doesn't cover the iris, so masking left the eye color with
    // nothing to tint. Iris instead tints its whole (neutral) diffuse through
    // material.color below (tintKind 'iris'), like hair.
    const paletteMask = customization && shaderPackage === 'skin.shpk'
      ? decodedMaterial?.textures.skinColorMask
      : undefined
    const paletteColor = customization ? customization.skinColor : undefined
    // Iris masks encode palette influence, not generic character PBR channels.
    const usesGenericMaskPbr = !isIris
    const aoMap = ao
      ? textureFromDecoded(ao, false, anisotropy)
      : mask && usesGenericMaskPbr
        ? textureFromChannel(mask, 2, 'rgb', anisotropy)
        : null
    const roughnessMap = roughness
      ? textureFromDecoded(roughness, false, anisotropy)
      : mask && usesGenericMaskPbr
        ? textureFromDecoded(mask, false, anisotropy)
        : null
    const specularIntensityMap = specularIntensity
      ? textureFromDecoded(specularIntensity, false, anisotropy)
      : mask && usesGenericMaskPbr
        ? textureFromChannel(mask, 0, 'alpha', anisotropy)
        : null
    const material = new THREE.MeshPhysicalMaterial({
      color: diffuse ? (paletteMask ? 0xffffff : materialTint) : meshColor,
      map: diffuse ? textureFromDecoded(diffuse, true, anisotropy) : null,
      normalMap: normal ? textureFromDecoded(normal, false, anisotropy) : null,
      aoMap,
      aoMapIntensity: aoMap ? 0.85 : 1,
      roughnessMap,
      roughness: roughnessMap ? 1 : fallbackRoughness,
      metalnessMap: metalness ? textureFromDecoded(metalness, false, anisotropy) : null,
      // Character materials use colored specular rather than Three's metallic
      // workflow. Treating leather or cloth as metal removes their base color.
      metalness: metalness ? 1 : 0,
      emissiveMap: emissive ? textureFromDecoded(emissive, true, anisotropy) : null,
      emissive: emissive ? 0xffffff : 0x000000,
      specularColorMap: specularColor ? textureFromDecoded(specularColor, true, anisotropy) : null,
      specularIntensityMap,
      specularIntensity: specularIntensityMap ? mappedSpecularIntensity : fallbackSpecularIntensity,
      // Higher IOR raises dielectric reflectance so colored-specular gear reads
      // as polished metal (~11% vs ~3%); skin and cloth-weight shaders stay soft.
      ior: isGearShader ? 2.0 : 1.45,
      clearcoat: 0,
      sheen: 0,
      alphaTest: diffuse && alphaMode === 'mask' ? (shaderPackage === 'hair.shpk' ? 0.34 : 0.46) : 0,
      transparent: alphaMode === 'blend',
      depthWrite: alphaMode !== 'blend',
      side: decodedMaterial?.renderBackfaces ?? (alphaMode !== 'opaque' || shaderPackage === 'hair.shpk')
        ? THREE.DoubleSide
        : THREE.FrontSide,
      dithering: true,
      flatShading: false,
      polygonOffset: isIris,
      polygonOffsetFactor: isIris ? -1 : 0,
      polygonOffsetUnits: isIris ? -1 : 0,
    })
    const activeFacePaint = facePaintTexture && customization?.facePaint && renderPart.uvs2
      ? facePaintTexture
      : undefined
    const lipMask = customization && /_fac_[a-z]\.mtrl$/.test(materialPath)
      ? decodedMaterial?.textures.lipMask
      : undefined
    if (customization && (paletteMask || lipMask || activeFacePaint)) {
      enableMaterialCustomization(material, {
        paletteMask,
        paletteColor,
        lipMask,
        lipColor: customization.lipColor,
        facePaintTexture: activeFacePaint,
        facePaintColor: customization.facePaintColor,
      }, anisotropy)
    }
    // Register a live color updater for materials that respond to appearance
    // colors, so changing a picker retints these in place (see the color effect).
    if (customization && (tintKind !== 'none' || paletteMask || lipMask || activeFacePaint)) {
      customizationAppliers.push((values) => {
        if (paletteMask) {
          const tint = material.userData.paletteTintColor as THREE.Color | undefined
          tint?.setHex(tintFor(values))
        } else if (diffuse) {
          material.color.setHex(tintFor(values))
        }
        const lip = material.userData.lipTintColor as THREE.Color | undefined
        lip?.setHex(colorNumber(values.lipColor))
        const paint = material.userData.facePaintTintColor as THREE.Color | undefined
        paint?.setHex(colorNumber(values.facePaintColor))
      })
    }
    const hasEmissivePixels = emissive && hasVisibleRgb(emissive)
    const animationTrack = materialAnimation && materialAnimationTrack(materialAnimation, part.materialIndex)
    if (animationTrack && hasEmissivePixels) {
      material.emissiveIntensity = 1
      animatedMaterials.push({
        material,
        animation: materialAnimation,
        track: animationTrack,
        color: [0, 0, 0],
      })
    }
    if (normal) material.normalScale.set(resolvedMuscleNormalStrength, resolvedMuscleNormalStrength)
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(renderPart.positions, 3))
    if (renderPart.uvs) {
      geometry.setAttribute('uv', new THREE.BufferAttribute(renderPart.uvs, 2))
      geometry.setAttribute('uv1', new THREE.BufferAttribute(renderPart.uvs, 2))
    }
    if (renderPart.uvs2) {
      const secondaryUvs = new THREE.BufferAttribute(renderPart.uvs2, 2)
      geometry.setAttribute('uv2', secondaryUvs)
      if (activeFacePaint && /_fac_[a-z]\.mtrl$/.test(materialPath)) {
        // A dedicated attribute keeps the custom face-paint shader independent
        // from Three's built-in texture-channel defines.
        geometry.setAttribute('facePaintUv', secondaryUvs)
      }
    }
    let skinIndices = renderPart.skinIndices
    if (skinIndices && rig) {
      skinIndices = new Uint16Array(skinIndices).map((globalIndex) => (
        rig.boneIndex.get(model.boneNames[globalIndex] ?? '') ?? 0
      ))
    }
    if (skinIndices) geometry.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndices, 4))
    if (renderPart.skinWeights) geometry.setAttribute('skinWeight', new THREE.BufferAttribute(renderPart.skinWeights, 4))
    geometry.setIndex(new THREE.BufferAttribute(renderPart.indices, 1))
    // FFXIV's authored normals preserve smoothing across material submeshes. Recomputing
    // them independently makes the face look faceted at every material boundary.
    if (renderPart.normals?.every(Number.isFinite)) geometry.setAttribute('normal', new THREE.BufferAttribute(renderPart.normals, 3))
    else geometry.computeVertexNormals()
    geometry.normalizeNormals()
    geometry.computeBoundingBox()
    geometry.computeBoundingSphere()
    const mesh = rig && skinIndices && renderPart.skinWeights
      ? new THREE.SkinnedMesh(geometry, material)
      : new THREE.Mesh(geometry, material)
    mesh.name = `${label}-${index}`
    if (isIris) mesh.renderOrder = 10
    target.add(mesh)
    if (mesh instanceof THREE.SkinnedMesh && rig) {
      target.updateMatrixWorld(true)
      mesh.bind(rig.skeleton, mesh.matrixWorld)
    }
  }
  return model.meshes.length
}

const ATTRIBUTE_PREFIX: Partial<Record<EquipmentSlot, string>> = {
  head: 'atr_mv_',
  body: 'atr_tv_',
  hands: 'atr_gv_',
  legs: 'atr_dv_',
  feet: 'atr_sv_',
  ears: 'atr_ev_',
  neck: 'atr_nv_',
  wrists: 'atr_wv_',
  rightRing: 'atr_rv_',
  leftRing: 'atr_rv_',
}

function isVisibleEquipmentPart(attributes: string[] | undefined, slot: EquipmentSlot, mask: number): boolean {
  const prefix = ATTRIBUTE_PREFIX[slot]
  if (!prefix) return true
  const variants = attributes?.filter((attribute) => attribute.toLowerCase().startsWith(prefix)) ?? []
  if (!variants.length) return true
  return variants.some((attribute) => {
    const index = attribute.toLowerCase().charCodeAt(prefix.length) - 97
    return index >= 0 && index < 10 && (mask & (1 << index)) !== 0
  })
}

interface EquipmentAttachment {
  target: THREE.Object3D
  diagnostic: string
}

function handWeaponTarget(character: THREE.Group, rig: CharacterRig | undefined, slot: EquipmentSlot): EquipmentAttachment {
  if (!rig || !isWeaponSlot(slot)) return { target: character, diagnostic: 'placement=hand bone=unavailable fallback=character-root' }
  const names = slot === 'mainHand'
    ? ['j_buki_r', 'n_buki_r', 'j_te_r', 'j_hand_r']
    : ['j_buki_l', 'n_buki_l', 'j_te_l', 'j_hand_l']
  const bone = names.map((name) => rig.skeleton.bones.find((candidate) => candidate.name === name)).find(Boolean)
  return bone
    ? { target: bone, diagnostic: `placement=hand bone=${bone.name} fallback=false` }
    : { target: character, diagnostic: `placement=hand bone=unavailable candidates=${names.join(',')} fallback=character-root` }
}

function backWeaponTarget(
  character: THREE.Group,
  rig: CharacterRig | undefined,
  slot: EquipmentSlot,
  model: DecodedModel,
): EquipmentAttachment {
  if (!rig || !isWeaponSlot(slot)) return { target: character, diagnostic: 'placement=back bone=unavailable fallback=character-root' }
  character.updateMatrixWorld(true)
  const spineNames = ['j_sebo_c', 'j_sebo_b', 'j_sebo_a', 'j_kosi']
  const spine = spineNames.map((name) => rig.skeleton.bones.find((bone) => bone.name === name)).find(Boolean)
  const anchor = spine
    ? spine.getWorldPosition(new THREE.Vector3())
    : new THREE.Vector3(0, 1.2, 0)
  anchor.add(new THREE.Vector3(slot === 'mainHand' ? -0.1 : 0.1, 0.03, -0.15))

  const size = new THREE.Vector3(
    model.bounds.max[0] - model.bounds.min[0],
    model.bounds.max[1] - model.bounds.min[1],
    model.bounds.max[2] - model.bounds.min[2],
  )
  const longestAxisIndex = size.x >= size.y && size.x >= size.z ? 0 : size.y >= size.z ? 1 : 2
  const longestAxis = new THREE.Vector3(
    longestAxisIndex === 0 ? 1 : 0,
    longestAxisIndex === 1 ? 1 : 0,
    longestAxisIndex === 2 ? 1 : 0,
  )
  const desiredDirection = new THREE.Vector3(slot === 'mainHand' ? 0.55 : -0.55, 0.835, 0).normalize()
  const orientation = new THREE.Quaternion().setFromUnitVectors(longestAxis, desiredDirection)
  const center = new THREE.Vector3(
    (model.bounds.min[0] + model.bounds.max[0]) / 2,
    (model.bounds.min[1] + model.bounds.max[1]) / 2,
    (model.bounds.min[2] + model.bounds.max[2]) / 2,
  )
  const mount = new THREE.Group()
  mount.name = `${slot}-back-mount`
  mount.quaternion.copy(orientation)
  mount.position.copy(anchor).sub(center.applyQuaternion(orientation))
  character.add(mount)
  character.updateMatrixWorld(true)
  if (spine) spine.attach(mount)
  return {
    target: mount,
    diagnostic: `placement=back bone=${spine?.name ?? 'character-root'} longestModelAxis=${['x', 'y', 'z'][longestAxisIndex]} anchor=${formatVector(anchor.toArray())} diagonal=${formatVector(desiredDirection.toArray())} fallback=${!spine}`,
  }
}

function equipmentTarget(
  character: THREE.Group,
  rig: CharacterRig | undefined,
  slot: EquipmentSlot,
  placement: WeaponPlacement,
  model: DecodedModel,
): EquipmentAttachment {
  return placement === 'back'
    ? backWeaponTarget(character, rig, slot, model)
    : handWeaponTarget(character, rig, slot)
}

// Builds the framing box from the wearer's body and worn armor, deliberately
// excluding hand/back weapon reach and the volatile AVFX particle cloud. This
// keeps the character centered in the preview panel when a large weapon or an
// expanding effect would otherwise drag the combined bounding box off to one
// side.
function characterFramingBox(root: THREE.Object3D): THREE.Box3 {
  root.updateMatrixWorld(true)
  const box = new THREE.Box3()
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    if (/^equipment-(mainHand|offHand)/.test(object.name)) return
    if (object.name.startsWith('avfx-particle')) return
    box.expandByObject(object)
  })
  return box
}

function fitCamera(camera: THREE.PerspectiveCamera, controls: OrbitControls, box: THREE.Box3, padding = 1.36) {
  if (box.isEmpty()) return
  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  const verticalFov = THREE.MathUtils.degToRad(camera.fov)
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * Math.max(camera.aspect, 0.1))
  const verticalDistance = (Math.max(size.y, 0.8) / 2) / Math.tan(verticalFov / 2)
  const horizontalDistance = (Math.max(size.x, 0.4) / 2) / Math.tan(horizontalFov / 2)
  const distance = (Math.max(verticalDistance, horizontalDistance) + size.z / 2) * padding
  const viewDirection = new THREE.Vector3(0.1, 0.025, 1).normalize()
  // Anchor the framing horizontally to the character's standing axis (world
  // origin) rather than the bounding-box center. Asymmetric parts — long hair
  // swept over one shoulder, an idle pose with one arm raised, a large weapon —
  // pull the box center sideways and would otherwise slide the whole figure off
  // to one edge of the panel. FFXIV bodies are authored symmetric about x=0 at
  // the origin, so this keeps the wearer centered no matter what is equipped.
  const framingCenter = new THREE.Vector3(0, center.y, 0)
  controls.target.copy(framingCenter)
  camera.position.copy(framingCenter).addScaledVector(viewDirection, distance)
  camera.near = Math.max(distance / 100, 0.01)
  camera.far = Math.max(distance + size.length() * 12, 50)
  camera.updateProjectionMatrix()
  controls.minDistance = Math.max(size.y * 0.12, 0.2)
  controls.maxDistance = Math.max(distance * 4, 12)
  controls.update()
}

function framingDiagnostic(box: THREE.Box3, camera: THREE.PerspectiveCamera, controls: OrbitControls, host: HTMLElement): string {
  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  const canvas = host.firstElementChild as HTMLCanvasElement | null
  return [
    `camera framing: boxCenter=${formatVector(center.toArray(), 3)} boxSize=${formatVector(size.toArray(), 3)}`,
    `  target=${formatVector(controls.target.toArray(), 3)} cameraPos=${formatVector(camera.position.toArray(), 3)} aspect=${camera.aspect.toFixed(3)}`,
    `  panelCss=${host.clientWidth}x${host.clientHeight} canvasCss=${canvas?.clientWidth ?? '?'}x${canvas?.clientHeight ?? '?'}`,
  ].join('\n')
}

async function loadRemoteModel(source: Extract<AssetSource, { kind: 'remote' }>, path: string): Promise<THREE.Group> {
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
  const convertedPath = path.replace(/\.mdl$/i, '.glb')
  const url = new URL(convertedPath, source.baseUrl).toString()
  try {
    const result = await new GLTFLoader().loadAsync(url)
    return result.scene
  } catch (error) {
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
    throw new Error(`[fetch-glb] ${url} — ${detail}`)
  }
}

function resultMap(results: ModelLoadResult[]): Map<string, ModelLoadResult> {
  return new Map(results.map((result) => [result.path, result]))
}

function uvSummary(values: Float32Array | undefined): string {
  if (!values?.length) return 'missing'
  let minU = Number.POSITIVE_INFINITY
  let minV = Number.POSITIVE_INFINITY
  let maxU = Number.NEGATIVE_INFINITY
  let maxV = Number.NEGATIVE_INFINITY
  for (let offset = 0; offset + 1 < values.length; offset += 2) {
    minU = Math.min(minU, values[offset]!)
    minV = Math.min(minV, values[offset + 1]!)
    maxU = Math.max(maxU, values[offset]!)
    maxV = Math.max(maxV, values[offset + 1]!)
  }
  const value = (number: number) => Number.isFinite(number) ? number.toFixed(3) : 'invalid'
  return `u=${value(minU)}..${value(maxU)} v=${value(minV)}..${value(maxV)}`
}

function modelMaterialDiagnostics(
  label: string,
  model: DecodedModel,
  materialResult: Awaited<ReturnType<typeof loadLocalMaterials>>[number] | undefined,
  equipment: boolean,
): string[] {
  const deformation = model.deformation
  const summary = `${label}: LOD${model.lod ?? '?'}${deformation
    ? ` · PBD c${deformation.sourceRaceCode.toString().padStart(4, '0')}→c${deformation.targetRaceCode.toString().padStart(4, '0')} steps=${deformation.steps} matrixBones=${deformation.matrixBones} vertices=${deformation.vertices} normals=${deformation.normals}`
    : ' · native race geometry'}${model.availableShapes?.length ? ` · shapes=${model.activeShapes?.join(',') || 'base'} replacements=${model.shapeReplacements ?? 0}/${model.availableShapes.length} available` : ''}`
  const meshes = model.meshes.flatMap((mesh, index) => {
    const reference = model.materialPaths[mesh.materialIndex]?.replaceAll('\\', '/').toLowerCase() ?? '(missing)'
    const material = materialResult?.materials[reference]
    const face = label === 'character face'
    const torso = label === 'character torso'
    const iris = material?.shaderPackage.toLowerCase() === 'iris.shpk' || reference.includes('_iri_')
    if (!equipment && !face && !torso && !iris) return []
    return [
      `${label} mesh ${index}: materialIndex=${mesh.materialIndex} reference=${reference}`,
      `  shader=${material?.shaderPackage ?? 'unresolved'} flags=${material ? `0x${material.shaderFlags.toString(16).padStart(8, '0')}` : 'n/a'} alpha=${material?.alphaMode ?? 'n/a'} backfaces=${material?.renderBackfaces ?? 'n/a'} vertices=${mesh.positions.length / 3} triangles=${mesh.indices.length / 3}`,
      `  uv0=${uvSummary(mesh.uvs)} uv1=${uvSummary(mesh.uvs2)}`,
      `  skin=${mesh.skinIndices && mesh.skinWeights ? 'yes' : 'no'} attributes=${mesh.attributes?.join(',') || 'none'}`,
    ].join('\n')
  })
  return [summary, ...meshes]
}

async function diagnosticReport(source: AssetSource, failures: string[], diagnostics: string[] = []): Promise<string> {
  let permission = 'not applicable'
  if (source.kind === 'local' && source.handle) {
    try {
      permission = await source.handle.queryPermission({ mode: 'read' })
    } catch (error) {
      permission = `query failed: ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`
    }
  }
  return [
    `Asset source: ${source.kind}${source.kind === 'local' ? ` (${source.access})` : ''}`,
    `Source label: ${source.label}`,
    `Directory handle: ${source.kind === 'local' && source.handle ? 'present' : 'not present'}`,
    `Read permission: ${permission}`,
    `Secure context: ${window.isSecureContext}`,
    `Origin: ${window.location.origin}`,
    `Cross-origin isolated: ${window.crossOriginIsolated}`,
    `Browser: ${navigator.userAgent}`,
    '',
    'Asset failures:',
    ...(failures.length ? failures : ['none']),
    '',
    'Material and geometry diagnostics:',
    ...(diagnostics.length ? diagnostics : ['none captured']),
  ].join('\n')
}

export default function ViewerCanvas({ source, equipped, raceCode, customization }: ViewerCanvasProps) {
  const container = useRef<HTMLDivElement>(null)
  const idleAction = useRef<THREE.AnimationAction | null>(null)
  const idleMixer = useRef<THREE.AnimationMixer | null>(null)
  const resetView = useRef<(() => void) | null>(null)
  // Set once the character is built; loads and plays a catalog animation on the
  // live rig. Null until ready and while the effect is torn down.
  const playCatalogAnimation = useRef<((entry: CatalogAnimation) => Promise<void>) | null>(null)
  // Retargets a dropped-in glTF/GLB motion (e.g. a Meddle export) onto the rig by
  // bone name — the reliable path that bypasses in-browser PAP spline decoding.
  const playExternalMotion = useRef<((data: ArrayBuffer, label: string) => Promise<void>) | null>(null)
  const motionInput = useRef<HTMLInputElement>(null)
  // Last catalog animation the user played, for the raw-.pap download affordance.
  const lastCatalogEntry = useRef<CatalogAnimation | null>(null)
  // Per-material color updaters, repopulated whenever the character is rebuilt.
  // A color-picker change runs these to retint the live materials in place
  // instead of tearing down and reloading the whole character.
  const customizationAppliers = useRef<CustomizationApplier[]>([])
  const previewItems = EQUIPMENT_SLOTS.flatMap((slot) => equipped[slot] ? [[slot, equipped[slot]!] as const] : [])
  const [status, setStatus] = useState('Loading character…')
  const [error, setError] = useState<string>()
  const [debug, setDebug] = useState<string>()
  const [idleState, setIdleState] = useState<IdleAnimationState>(source.kind === 'local' ? 'loading' : 'unavailable')
  const [idleLabel, setIdleLabel] = useState('Idle')
  const [activeAnimId, setActiveAnimId] = useState<string>()
  const [animBusy, setAnimBusy] = useState(false)
  const [animNotice, setAnimNotice] = useState<string>()
  const [animDiag, setAnimDiag] = useState<string>()

  const onSelectAnimation = async (entry: CatalogAnimation) => {
    const play = playCatalogAnimation.current
    if (!play) return
    setAnimBusy(true)
    setAnimNotice(undefined)
    try {
      await play(entry)
      lastCatalogEntry.current = entry
      setActiveAnimId(entry.id)
    } catch (reason) {
      lastCatalogEntry.current = entry
      const detail = reason instanceof Error ? reason.message : String(reason)
      setAnimNotice(/additive/i.test(detail)
        ? `“${entry.label}” is an additive overlay clip and can’t play as a standalone pose yet.`
        : `Could not play “${entry.label}”: ${detail}`)
    } finally {
      setAnimBusy(false)
    }
  }

  // Downloads the exact raw .pap the viewer resolves for the last-played catalog
  // animation, so a broken clip can be shared for decoder debugging. Reads from the
  // already-connected local install — no external extraction tool needed.
  const onDownloadSource = async () => {
    const entry = lastCatalogEntry.current
    if (!entry || source.kind !== 'local') return
    setAnimNotice(undefined)
    try {
      const reader = createLocalAssetReader(source)
      let bytes: ArrayBuffer | undefined
      let used = ''
      const errors: string[] = []
      for (const path of catalogAnimationCandidates(entry, raceCode)) {
        try { bytes = await reader.read(path); used = path; break } catch (reason) {
          errors.push(`${path}: ${reason instanceof Error ? reason.message : String(reason)}`)
        }
      }
      if (!bytes) throw new Error(errors.join(' / ') || 'not found')
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }))
      const link = document.createElement('a')
      link.href = url
      link.download = `${entry.id}.pap`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      setAnimNotice(`Saved ${entry.id}.pap (${(bytes.byteLength / 1024).toFixed(1)} KB) from ${used}.`)
    } catch (reason) {
      setAnimNotice(`Could not read the raw .pap: ${reason instanceof Error ? reason.message : String(reason)}`)
    }
  }

  const onMotionFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    const play = playExternalMotion.current
    if (!file || !play) return
    setAnimBusy(true)
    setAnimNotice(undefined)
    try {
      await play(await file.arrayBuffer(), file.name.replace(/\.[^.]+$/, ''))
      setActiveAnimId(undefined)
    } catch (reason) {
      setAnimNotice(reason instanceof Error ? reason.message : 'Could not load that motion file.')
    } finally {
      setAnimBusy(false)
    }
  }

  const startIdle = () => {
    const action = idleAction.current
    if (!action) return
    action.paused = false
    action.play()
    setIdleState('playing')
  }

  const pauseIdle = () => {
    const action = idleAction.current
    if (!action) return
    action.paused = true
    setIdleState('paused')
  }

  useEffect(() => {
    const host = container.current
    if (!host) return
    let disposed = false

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 100)
    camera.position.set(0.2, 1.05, 4)
    const renderPixelRatio = Math.min(Math.max(window.devicePixelRatio, 2), 3)
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
      precision: 'highp',
    })
    // Supersample even on standard-DPI monitors. This improves silhouettes,
    // fine hair cards, and texture inspection without inventing geometry that
    // is not present in the game's highest-detail LOD0 model.
    renderer.setPixelRatio(renderPixelRatio)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.NeutralToneMapping
    renderer.toneMappingExposure = 1.05
    const maxAnisotropy = renderer.capabilities.getMaxAnisotropy()
    host.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.075
    controls.rotateSpeed = 0.7
    controls.zoomSpeed = 0.8
    controls.target.set(0, 0.95, 0)
    controls.minDistance = 0.25
    controls.maxDistance = 12
    const fallback = addFallbackMannequin(scene)
    const characterGroup = new THREE.Group()
    characterGroup.name = `${raceCode}-character`
    scene.add(characterGroup)
    let activeIdleMixer: THREE.AnimationMixer | undefined
    const animatedMaterials: AnimatedMaterial[] = []
    const avfxRuntimes: AvfxRuntime[] = []
    // Rebuilt below as character materials are created; the color effect reads this.
    customizationAppliers.current = []
    idleAction.current = null
    idleMixer.current = null
    playCatalogAnimation.current = null
    playExternalMotion.current = null
    setIdleLabel('Idle')
    setIdleState(source.kind === 'local' ? 'loading' : 'unavailable')
    // A character rebuild (gear/customization change) reverts to idle, so clear
    // any catalog selection highlight and stale notice.
    setActiveAnimId(undefined)
    setAnimNotice(undefined)
    setAnimDiag(undefined)

    // A brighter neutral studio rig so dark, reflective gear reads as metal
    // instead of black. Neutral tone mapping still rolls off the highlights, so
    // the stronger key does not blow out skin.
    scene.add(new THREE.HemisphereLight(0xf7f8ff, 0x2b2820, 1.0))
    const key = new THREE.DirectionalLight(0xffffff, 1.55)
    key.position.set(4, 5, 6)
    scene.add(key)
    const fill = new THREE.DirectionalLight(0xf3f6ff, 0.55)
    fill.position.set(-4, 3, 5)
    scene.add(fill)
    const rim = new THREE.DirectionalLight(0xfff4e8, 0.3)
    rim.position.set(-4, 4, -4)
    scene.add(rim)
    // Image-based reflections. In-game these dark-diffuse weapon materials are
    // lit almost entirely by specular reflection; with no environment to
    // reflect, they render flat black. A neutral room gives them highlights and
    // surface detail. ShaderMaterial-based AVFX particles are unaffected.
    const environmentScene = new RoomEnvironment()
    const pmrem = new THREE.PMREMGenerator(renderer)
    const environmentTexture = pmrem.fromScene(environmentScene, 0.04).texture
    scene.environment = environmentTexture
    // Metal gear is now metallic, so its whole look is the reflection; give it a
    // touch more environment to read as polished rather than dark.
    scene.environmentIntensity = 0.8
    pmrem.dispose()
    environmentScene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      object.geometry.dispose()
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      materials.forEach((material) => material.dispose())
    })

    const allCharacterPlans = characterModelPlan(raceCode, { faceId: customization.face, hairId: customization.hairstyle })
    const selected = (Object.entries(equipped) as Array<[EquipmentSlot, EquippedArmor[EquipmentSlot]]>)
      .filter((entry): entry is [EquipmentSlot, NonNullable<EquippedArmor[EquipmentSlot]>] => Boolean(entry[1]))
    const equipmentPlans = selected.map(([slot, item]) => ({
      slot,
      item,
      asset: equipmentAssetPlan(item, raceCode),
      candidates: equipmentModelCandidates(item, raceCode),
    }))
    // A dual-wield main-hand weapon (Rogue/Ninja daggers, Viper twinblades) carries
    // a second blade in ModelSub that the game renders in the left hand. Synthesize
    // an off-hand plan for it unless the off-hand slot already holds an item.
    const mainHand = equipped.mainHand
    if (mainHand?.weaponSubModel && !equipped.offHand) {
      const sub = mainHand.weaponSubModel
      const offHandItem: ArmorItem = {
        ...mainHand,
        slot: 'offHand',
        modelSet: sub.set,
        modelBase: sub.base,
        modelVariant: sub.variant,
        weaponSubModel: undefined,
      }
      equipmentPlans.push({
        slot: 'offHand',
        item: offHandItem,
        asset: equipmentAssetPlan(offHandItem, raceCode),
        candidates: equipmentModelCandidates(offHandItem, raceCode),
      })
    }
    const characterPlans = allCharacterPlans.filter((plan) => !plan.coveredBy || !equipped[plan.coveredBy])
    const headHairVisibility = equipped.head?.headHairVisibility ?? 'auto'
    let hairHidden = headHairVisibility === 'hide'
    setError(undefined)
    setDebug(undefined)
    setStatus(`Reading ${raceCode} character models…`)

    void (async () => {
      const failures: string[] = []
      const diagnostics: string[] = [
        `render quality: authoredGeometry=LOD0 pixelRatio=${renderPixelRatio.toFixed(2)} precision=highp antialias=MSAA textureFilter=trilinear-mipmap textureAnisotropy=${maxAnisotropy} output=sRGB toneMapping=Neutral exposure=${renderer.toneMappingExposure.toFixed(2)}`,
        `customization sliders: race=${raceCode} tribe=${customization.tribeId} gender=${customization.gender} bustSize=${customization.bustSize} muscleTone=${customization.muscleTone} muscleNormalStrength=${muscleNormalStrength(customization.muscleTone).toFixed(4)}`,
      ]
      let characterParts = 0
      let equippedItems = 0
      let rig: CharacterRig | undefined
      let decodedSkeleton: DecodedSkeleton | undefined
      let bustScale: BustScale = [1, 1, 1]
      let baseIdleClip: THREE.AnimationClip | undefined
      let idleAnimationPromise: Promise<DecodedAnimation> | undefined
      let idleReady = false
      if (source.kind === 'local') {
        try {
          setStatus(`Reading ${raceCode} base, face, and hair skeletons…`)
          let combinedSkeleton = await loadLocalSkeleton(source, skeletonPath(raceCode))
          let faceSkeletonLoaded = false
          const faceSkeletonErrors: string[] = []
          for (const path of faceSkeletonCandidates(raceCode)) {
            try {
              const faceSkeleton = await loadLocalSkeleton(source, path)
              combinedSkeleton = attachSkeleton(combinedSkeleton, faceSkeleton, 'j_kao')
              faceSkeletonLoaded = true
              break
            } catch (reason) {
              if (!isMissingLocalSkeletonError(reason, path)) {
                faceSkeletonErrors.push(reason instanceof Error ? reason.message : String(reason))
              }
            }
          }
          if (!faceSkeletonLoaded && faceSkeletonErrors.length) {
            failures.push(`face skeleton: ${faceSkeletonErrors.join(' / ')}`)
          }
          try {
            const hairSkeleton = await loadLocalHairSkeleton(source, raceCode, customization.hairstyle)
            if (hairSkeleton) combinedSkeleton = attachSkeleton(combinedSkeleton, hairSkeleton.skeleton, 'j_kao')
          } catch (reason) {
            failures.push(`hair skeleton: ${reason instanceof Error ? reason.message : String(reason)}`)
          }
          for (const auxiliary of auxiliarySkeletonPlan(raceCode)) {
            try {
              const skeleton = await loadLocalSkeleton(source, auxiliary.path)
              combinedSkeleton = attachSkeleton(combinedSkeleton, skeleton, auxiliary.attachmentBone)
            } catch (reason) {
              if (!isMissingLocalSkeletonError(reason, auxiliary.path)) {
                failures.push(`${auxiliary.part} skeleton: ${reason instanceof Error ? reason.message : String(reason)}`)
              }
            }
          }
          decodedSkeleton = combinedSkeleton
          if (customization.gender === 'female') {
            try {
              bustScale = await loadLocalBustScale(source, customization.tribeId, customization.bustSize)
              diagnostics.push(
                `bust RSP: ${HUMAN_CMP_PATH} tribe=${customization.tribeId} value=${customization.bustSize} scale=${bustScale.map((value) => value.toFixed(4)).join(',')}`,
              )
            } catch (reason) {
              diagnostics.push(`bust RSP unavailable: ${reason instanceof Error ? reason.message : String(reason)}`)
            }
          }
          rig = addCharacterRig(characterGroup, combinedSkeleton, bustScale)
          diagnostics.push(bustRigDiagnostic(rig, 'after CMP bind', bustScale))
          idleAnimationPromise = loadLocalIdleAnimation(source, idleAnimationCandidates(raceCode))
        } catch (reason) {
          failures.push(`base skeleton: ${reason instanceof Error ? reason.message : String(reason)}`)
          setIdleState('unavailable')
        }
        const paths = [...new Set([
          ...characterPlans.flatMap(characterModelCandidates),
          ...equipmentPlans.flatMap((plan) => plan.candidates),
        ])]
        const selectedFaceShapes = activeFaceShapes(customization)
        const faceShapeSelections = Object.fromEntries(
          characterPlans
            .filter((plan) => plan.part === 'face')
            .flatMap((plan) => characterModelCandidates(plan).map((path) => [path, selectedFaceShapes])),
        )
        const byPath = resultMap(await loadLocalModels(source, paths, decodedSkeleton ? {
          targetRaceCode: raceCode,
          skeleton: decodedSkeleton,
        } : undefined, faceShapeSelections))
        if (disposed) return

        const characterModels = characterPlans.flatMap((plan) => {
          const result = characterModelCandidates(plan).map((path) => byPath.get(path)).find((candidate) => candidate?.model)
          return result?.model ? [{ plan, result: result as Required<Pick<ModelLoadResult, 'path' | 'model'>> }] : []
        })
        const equipmentModels = equipmentPlans.flatMap((plan) => {
          const result = plan.candidates.map((path) => byPath.get(path)).find((candidate) => candidate?.model)
          return result?.model ? [{ plan, result: result as Required<Pick<ModelLoadResult, 'path' | 'model'>> }] : []
        })
        if (customization.gender === 'female' && rig) {
          const activeRig = rig
          const bustModels = [
            ...characterModels
              .filter(({ plan }) => plan.part === 'torso')
              .map(({ result }) => ({ label: 'character torso', result })),
            ...equipmentModels
              .filter(({ plan }) => plan.slot === 'body')
              .map(({ plan, result }) => ({ label: plan.item.name, result })),
          ]
          bustModels.forEach(({ label, result }) => {
            diagnostics.push(bustModelDiagnostic(label, result.path, result.model))
            const deformation = applyBustDeformation(result.model, activeRig.skeleton, activeRig.boneIndex)
            diagnostics.push(bustDeformationDiagnostic(label, deformation))
          })
          neutralizeBustRig(activeRig, bustScale)
          diagnostics.push(bustRigDiagnostic(activeRig, 'after CPU bake (neutral for animation)', bustScale))
        }
        const materialRequests: MaterialLoadRequest[] = [
          ...characterModels.map(({ plan, result }) => ({
            modelPath: result.path,
            materialPaths: result.model.materialPaths,
            ...(plan.part === 'face' ? { facePaintId: customization.facePaint } : {}),
          })),
          ...equipmentModels.map(({ plan, result }) => ({
            modelPath: result.path,
            materialPaths: result.model.materialPaths,
            imcPath: plan.asset.imcPath,
            slot: plan.slot,
            variant: plan.asset.variant,
            stains: [plan.item.dyes?.[0]?.id ?? 0, plan.item.dyes?.[1]?.id ?? 0] as [number, number],
            equipmentSetId: plan.item.modelSet,
          })),
        ]
        setStatus(`Resolving ${materialRequests.length} material sets and textures…`)
        let materialResults: Awaited<ReturnType<typeof loadLocalMaterials>> = []
        try {
          materialResults = await loadLocalMaterials(source, materialRequests)
        } catch (reason) {
          failures.push(`material worker: ${reason instanceof Error ? reason.message : String(reason)}`)
        }
        if (disposed) return
        const materialsByModel = new Map(materialResults.map((result) => [result.modelPath, result]))
        diagnostics.push(`face customization: requestedShapes=${selectedFaceShapes.join(',') || 'base'} featureMask=0x${faceFeatureMask(customization).toString(16).padStart(2, '0')}`)
        diagnostics.push(...materialResults.flatMap((result) => result.diagnostics))
        const headEquipmentModel = equipmentModels.find(({ plan }) => plan.slot === 'head')
        const headMaterialResult = headEquipmentModel
          ? materialsByModel.get(headEquipmentModel.result.path)
          : undefined
        if (headHairVisibility === 'auto') hairHidden = headMaterialResult?.headHairHidden === true
        diagnostics.push(
          `head hair visibility: mode=${headHairVisibility} eqp=${headMaterialResult?.headHairHidden ?? 'unavailable'} resolvedHidden=${hairHidden}`,
        )

        for (const plan of characterPlans) {
          if (plan.part === 'hair' && hairHidden) continue
          const candidates = characterModelCandidates(plan)
          const result = candidates.map((path) => byPath.get(path)).find((candidate) => candidate?.model)
          if (result?.model) {
            const materialResult = materialsByModel.get(result.path)
            addDecodedModel(
              characterGroup,
              result.model,
              PART_COLORS[plan.part],
              `character-${plan.part}`,
              materialResult?.materials,
              undefined,
              undefined,
              rig,
              maxAnisotropy,
              customization,
              true,
              undefined,
              animatedMaterials,
              plan.part === 'face' ? materialResult?.facePaintTexture : undefined,
              customizationAppliers.current,
            )
            if (result.warning) failures.push(`${plan.part}: ${result.warning}`)
            if (materialResult?.errors.length) failures.push(...materialResult.errors.map((error) => `${plan.part} ${error}`))
            diagnostics.push(...modelMaterialDiagnostics(`character ${plan.part}`, result.model, materialResult, false))
            characterParts += 1
          } else if (!plan.optional) {
            const attempted = candidates.map((path) => byPath.get(path)?.error).filter(Boolean).join(' / ')
            failures.push(`${plan.part}: ${attempted || 'model not found'}`)
          }
        }
        if (characterModels.length) {
          diagnostics.push('character render refinement: all organic parts curved subdivision level=1 triangles=4x corners=preserved skinWeights=interpolated uint32=dense-mesh-enabled')
        }
        for (const plan of equipmentPlans) {
          const result = plan.candidates.map((path) => byPath.get(path)).find((candidate) => candidate?.model)
          if (result?.model) {
            const materialResult = materialsByModel.get(result.path)
            const weapon = isWeaponSlot(plan.slot)
            const animatedMaterialCount = animatedMaterials.length
            const attachment = weapon
              ? equipmentTarget(characterGroup, rig, plan.slot, plan.item.weaponPlacement ?? 'hand', result.model)
              : { target: characterGroup, diagnostic: '' }
            // FFXIV sizes a weapon to the wielder's race. Scale the weapon mesh
            // and its VFX together inside a group under the attach point so the
            // whole effect stays proportional on small races such as Lalafell.
            const weaponScale = weapon ? weaponRaceScale(raceCode) : 1
            let renderTarget = attachment.target
            if (weapon && weaponScale !== 1) {
              const scaled = new THREE.Group()
              scaled.name = `equipment-${plan.slot}-scale`
              scaled.scale.setScalar(weaponScale)
              attachment.target.add(scaled)
              renderTarget = scaled
            }
            addDecodedModel(
              renderTarget,
              result.model,
              SLOT_COLORS[plan.slot],
              `equipment-${plan.slot}`,
              materialResult?.materials,
              materialResult?.attributeMask,
              plan.slot,
              weapon ? undefined : rig,
              maxAnisotropy,
              customization,
              false,
              materialResult?.materialAnimation,
              animatedMaterials,
            )
            // Activate whenever the AVFX resolved, not only when it ships
            // separate ATEX textures: many weapon/relic effects draw embedded
            // model geometry with baked vertex colors and no texture layers.
            const vfxDrawsGeometry = materialResult?.vfx?.models.some((model) => model.positions.length && model.indices.length)
            const vfxRuntime = materialResult?.vfx && (materialResult.vfxTextures?.length || vfxDrawsGeometry)
              ? createAvfxRuntime(renderTarget, materialResult.vfx, materialResult.vfxTextures ?? [], maxAnisotropy)
              : undefined
            if (vfxRuntime) {
              avfxRuntimes.push(vfxRuntime)
              // The AVFX cannot be executed offline, so warm the graph a few
              // frames and record where particles actually land relative to the
              // weapon geometry they should decorate. A cloud clustered near the
              // origin while the weapon bounds sit far from it means the effect
              // is bound to a weapon sub-point (binder) we do not yet resolve;
              // a matching cloud means the offset is elsewhere (scale/per-type).
              for (let step = 0; step < 24; step += 1) vfxRuntime.update(1 / 60)
              const cloud = vfxRuntime.particleBounds()
              const drawn = vfxRuntime.renderedBounds()
              const bounds = result.model.bounds
              const attachScale = renderTarget.getWorldScale(new THREE.Vector3())
              const vfx = materialResult?.vfx
              const timelines = vfx?.timelines ?? []
              const axes = (curve: { x?: unknown; y?: unknown; z?: unknown }) => `${curve.x ? 'X' : ''}${curve.y ? 'Y' : ''}${curve.z ? 'Z' : ''}` || '0'
              const emitterSummary = (vfx?.emitters ?? [])
                .map((emitter, index) => `e${index}:t${emitter.type}/m${emitter.modelIndices.length}/pos${axes(emitter.position)}`)
                .join(' ')
              const particleHistogram = new Map<number, number>()
              for (const particle of vfx?.particles ?? []) particleHistogram.set(particle.type, (particleHistogram.get(particle.type) ?? 0) + 1)
              const particleSummary = [...particleHistogram.entries()].map(([type, count]) => `t${type}×${count}`).join(' ')
              const modelParticles = (vfx?.particles ?? []).filter((particle) => particle.modelIndices.length).length
              diagnostics.push([
                `equipment AVFX placement ${plan.item.name}:`,
                `  weaponModelBounds(local) min=${formatVector(bounds.min, 3)} max=${formatVector(bounds.max, 3)}`,
                `  particleSpawn(local) count=${vfxRuntime.renderedParticles} min=${formatVector(cloud.min.toArray(), 3)} max=${formatVector(cloud.max.toArray(), 3)}`,
                `  particleDrawn(local) empty=${drawn.isEmpty()} min=${formatVector(drawn.min.toArray(), 3)} max=${formatVector(drawn.max.toArray(), 3)}`,
                `  attach=${attachment.target.name || attachment.target.type} worldScale=${formatVector(attachScale.toArray(), 4)} rootEmitters=${vfx?.rootEmitterIndices.join(',') || 'none'}`,
                `  emitters ${emitterSummary || 'none'}`,
                `  particles ${particleSummary || 'none'} withModelGeometry=${modelParticles}/${vfx?.particles.length ?? 0}`,
                `  timeline binders=${timelines.flatMap((line) => line.items.map((item) => item.binder)).join(',') || 'none'} effectors=${timelines.flatMap((line) => line.items.map((item) => item.effector)).join(',') || 'none'}`,
              ].join('\n'))
            }
            if (weapon) diagnostics.push(`weapon attachment ${plan.item.name}: slot=${plan.slot} raceScale=${weaponScale.toFixed(2)} ${attachment.diagnostic}`)
            if (materialResult?.materialAnimationId) {
              diagnostics.push(`equipment material animation ${plan.item.name}: IMC id=${materialResult.materialAnimationId} path=${materialResult.materialAnimationPath ?? 'unresolved'} authoredTrackDecoded=${Boolean(materialResult.materialAnimation)} animatedMaterials=${animatedMaterials.length - animatedMaterialCount}`)
            }
            if (materialResult?.vfxId) {
              diagnostics.push(`equipment AVFX ${plan.item.name}: IMC id=${materialResult.vfxId} path=${materialResult.vfxPath ?? 'unresolved'} renderer=authored-graph emitters=${vfxRuntime?.decodedEmitters ?? 0} embeddedModels=${vfxRuntime?.decodedModels ?? 0} curves=true uvAnimation=true textureSequences=true texturePalette=true`)
            }
            if (result.warning) failures.push(`${plan.item.name}: ${result.warning}`)
            if (materialResult?.errors.length) failures.push(...materialResult.errors.map((error) => `${plan.item.name} ${error}`))
            diagnostics.push(...modelMaterialDiagnostics(plan.item.name, result.model, materialResult, true))
            equippedItems += 1
          } else {
            const attempted = plan.candidates.map((path) => byPath.get(path)?.error).filter(Boolean).join(' / ')
            failures.push(`${plan.item.name}: ${attempted || 'model not found'}`)
          }
        }
        if (idleAnimationPromise && rig) {
          try {
            setStatus(`Preparing ${raceCode} idle animation…`)
            const decodedAnimation = await idleAnimationPromise
            if (disposed) return
            const { clip, boundTracks, totalTracks, channels } = animationClipFromDecoded(decodedAnimation, rig.skeleton)
            baseIdleClip = clip
            activeIdleMixer = new THREE.AnimationMixer(characterGroup)
            const action = activeIdleMixer.clipAction(clip)
            if (decodedAnimation.blendHint === 'additive') {
              action.blendMode = THREE.AdditiveAnimationBlendMode
            }
            action.setLoop(THREE.LoopRepeat, Infinity)
            action.clampWhenFinished = false
            action.setEffectiveWeight(1)
            action.setEffectiveTimeScale(1)
            // Apply the authored first frame, but wait for an explicit Start.
            action.play()
            activeIdleMixer.update(0)
            action.paused = true
            diagnostics.push(bustRigDiagnostic(rig, 'after idle frame 0 (CPU-baked geometry)', bustScale))
            idleMixer.current = activeIdleMixer
            idleAction.current = action
            idleReady = true
            setIdleLabel(decodedAnimation.name || 'Idle')
            setIdleState('ready')
            diagnostics.push(
              `idle animation: ${decodedAnimation.path} name=${decodedAnimation.name} blend=${decodedAnimation.blendHint} duration=${decodedAnimation.duration.toFixed(3)}s frames=${decodedAnimation.times.length} tracks=${decodedAnimation.tracks.length} bound=${boundTracks}/${totalTracks} channels=${channels} rootTranslation=stabilized`,
            )
          } catch (reason) {
            const detail = reason instanceof Error ? reason.message : String(reason)
            failures.push(`idle animation: ${detail}`)
            setIdleState('unavailable')
          }
        }
        // Expose a live player for the animation catalog. It decodes the chosen
        // PAP from the same local install and swaps the clip on the idle mixer,
        // reusing the idle transport (Start/Pause) for the current animation.
        if (rig) {
          const animationRig = rig
          const animationBustScale = bustScale
          const localSource = source
          // Swaps a clip onto the character mixer (reused idle mixer) and plays it.
          const playClipOnRig = (clip: THREE.AnimationClip, label: string, blendHint?: 'normal' | 'additive') => {
            let mixer = idleMixer.current
            if (!mixer) {
              mixer = new THREE.AnimationMixer(characterGroup)
              idleMixer.current = mixer
              activeIdleMixer = mixer
            }
            const previous = idleAction.current
            if (previous) {
              previous.stop()
              mixer.uncacheClip(previous.getClip())
            }
            const action = mixer.clipAction(clip)
            if (blendHint === 'additive') {
              action.blendMode = THREE.AdditiveAnimationBlendMode
            }
            action.setLoop(THREE.LoopRepeat, Infinity)
            action.clampWhenFinished = false
            action.setEffectiveWeight(1)
            action.setEffectiveTimeScale(1)
            action.play()
            idleAction.current = action
            setIdleLabel(label)
            setIdleState('playing')
          }
          playCatalogAnimation.current = async (entry: CatalogAnimation) => {
            const decoded = await loadLocalAnimation(
              localSource,
              catalogAnimationCandidates(entry, raceCode),
              entry.internal || undefined,
            )
            if (disposed) return
            // Scan decoded transforms for anomalies. A standing idle stays near
            // |t|≈1, scale≈1; a decoder bug shows up here as huge translations,
            // out-of-range scales, or non-finite values — pinpointing the failure
            // without needing the raw PAP bytes.
            let maxTranslation = 0
            let minScale = Infinity
            let maxScale = -Infinity
            let nonFinite = 0
            for (const track of decoded.tracks) {
              for (const value of track.translations) {
                if (!Number.isFinite(value)) nonFinite += 1
                else maxTranslation = Math.max(maxTranslation, Math.abs(value))
              }
              for (const value of track.scales) {
                if (!Number.isFinite(value)) nonFinite += 1
                else { minScale = Math.min(minScale, value); maxScale = Math.max(maxScale, value) }
              }
            }
            const { clip, boundTracks, totalTracks, channels } = animationClipFromDecoded(decoded, animationRig.skeleton, animationBustScale)
            const diag = `animation ${entry.id}: pap=${decoded.path} track=${decoded.name} blend=${decoded.blendHint} bound=${boundTracks}/${totalTracks} channels=${channels} maxT=${maxTranslation.toFixed(2)} scale=[${minScale.toFixed(2)},${maxScale.toFixed(2)}] nonFinite=${nonFinite} duration=${decoded.duration.toFixed(3)}s`
            console.info(`[glamour-viewer] ${diag}`)
            setAnimDiag(diag)
            playClipOnRig(clip, entry.label, decoded.blendHint)
          }
          playExternalMotion.current = async (data: ArrayBuffer, label: string) => {
            const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
            const gltf = await new Promise<{ animations: THREE.AnimationClip[] }>((resolve, reject) => {
              new GLTFLoader().parse(data, '', resolve, reject)
            })
            if (disposed) return
            const clip = gltf.animations[0]
            if (!clip) throw new Error('That glTF/GLB has no animation track.')
            // Rig bones use FFXIV joint names (j_*, n_*); the mixer binds the clip's
            // tracks to them by name, so a Meddle/TexTools export retargets directly.
            // Drop all translations except for weapons/ik, to prevent limb stretching.
            // We drop n_root to keep them centered in the preview.
            const retargeted = clip.clone()
            retargeted.tracks = retargeted.tracks.filter((track) => {
              if (!track.name.endsWith('.position')) return true
              const boneName = track.name.split('.')[0]!
              return boneName.startsWith('j_buki_') || boneName.startsWith('n_buki_') || boneName.startsWith('ik_') || boneName.startsWith('iv_')
            })
            const rigBoneNames = new Set(animationRig.skeleton.bones.map((bone) => bone.name))
            const matched = new Set(
              retargeted.tracks.map((track) => track.name.split('.')[0]!).filter((name) => rigBoneNames.has(name)),
            )

            const diag = `external motion ${label}: clip=${clip.name || 'unnamed'} tracks=${clip.tracks.length} matchedBones=${matched.size}/${animationRig.skeleton.bones.length} duration=${clip.duration.toFixed(3)}s`
            console.info(`[glamour-viewer] ${diag}`)
            setAnimDiag(diag)
            if (!matched.size) throw new Error('None of that motion’s bones match this character’s skeleton.')
            playClipOnRig(retargeted, label)
          }
        }
      } else {
        for (const plan of characterPlans) {
          if (plan.part === 'hair' && hairHidden) continue
          let loaded = false
          let lastReason: unknown
          for (const path of characterModelCandidates(plan)) {
            try {
              characterGroup.add(await loadRemoteModel(source, path))
              characterParts += 1
              loaded = true
              break
            } catch (reason) {
              lastReason = reason
            }
          }
          if (!loaded && !plan.optional) {
            failures.push(`${plan.part}: ${lastReason instanceof Error ? lastReason.message : 'model not found'}`)
          }
        }
        for (const plan of equipmentPlans) {
          let loaded = false
          for (const path of plan.candidates) {
            try {
              characterGroup.add(await loadRemoteModel(source, path))
              equippedItems += 1
              loaded = true
              break
            } catch {
              // Try the Midlander fallback before surfacing one failure.
            }
          }
          if (!loaded) failures.push(`${plan.item.name}: converted GLB not found`)
        }
      }

      if (disposed) return
      fallback.visible = characterParts === 0
      if (characterParts || equippedItems) {
        const refit = () => {
          const bodyBox = characterFramingBox(characterGroup)
          const framed = bodyBox.isEmpty() ? new THREE.Box3().setFromObject(characterGroup) : bodyBox
          fitCamera(camera, controls, framed)
          return framed
        }
        resetView.current = refit
        diagnostics.push(framingDiagnostic(refit(), camera, controls, host))
      }
      setStatus(characterParts
        ? `${raceCode} ${rig ? 'skinned' : 'bind-pose'} character · ${equippedItems}/${selected.length} equipped${source.kind === 'local' ? ` · idle ${idleReady ? 'ready' : 'unavailable'}` : ''} · drag to rotate`
        : 'Character models could not be decoded')
      if (source.kind === 'local') {
        const report = await diagnosticReport(source, failures, diagnostics)
        if (!disposed) {
          if (failures.length) setError(report)
          else setDebug(report)
        }
      }
    })().catch((reason) => {
      if (disposed) return
      setStatus('Character models could not be decoded')
      const failure = reason instanceof Error ? `${reason.name}: ${reason.message}` : 'Unknown character decode error'
      void diagnosticReport(source, [`worker: ${failure}`]).then((report) => {
        if (!disposed) setError(report)
      })
    })

    let frame = 0
    const resize = () => {
      const { clientWidth, clientHeight } = host
      renderer.setSize(clientWidth, clientHeight, false)
      camera.aspect = clientWidth / Math.max(clientHeight, 1)
      camera.updateProjectionMatrix()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(host)
    resize()
    const clock = new THREE.Clock()
    let elapsed = 0
    const render = () => {
      const delta = Math.min(clock.getDelta(), 0.1)
      elapsed += delta
      activeIdleMixer?.update(delta)
      animatedMaterials.forEach(({ material, animation, track, color }) => {
        sampleMaterialAnimationTrack(animation, track, elapsed, color)
        material.emissive.setRGB(
          Math.max(0, color[0]),
          Math.max(0, color[1]),
          Math.max(0, color[2]),
        )
      })
      avfxRuntimes.forEach((runtime) => runtime.update(delta, camera))
      controls.update()
      renderer.render(scene, camera)
      frame = requestAnimationFrame(render)
    }
    render()

    return () => {
      disposed = true
      resetView.current = null
      cancelAnimationFrame(frame)
      observer.disconnect()
      controls.dispose()
      avfxRuntimes.forEach((runtime) => runtime.dispose())
      playCatalogAnimation.current = null
      playExternalMotion.current = null
      activeIdleMixer?.stopAllAction()
      if (idleMixer.current === activeIdleMixer) {
        idleMixer.current = null
        idleAction.current = null
      }
      scene.traverse((object) => {
        if (object instanceof THREE.Sprite) {
          object.material.map?.dispose()
          object.material.dispose()
          return
        }
        if (!(object instanceof THREE.Mesh)) return
        object.geometry.dispose()
        const materials = Array.isArray(object.material) ? object.material : [object.material]
        materials.forEach((item) => {
          if (item instanceof THREE.MeshStandardMaterial) {
            new Set([item.map, item.normalMap, item.aoMap, item.roughnessMap, item.metalnessMap, item.emissiveMap].filter(Boolean)).forEach((texture) => texture?.dispose())
          }
          if (item instanceof THREE.MeshPhysicalMaterial) {
            new Set([item.specularColorMap, item.specularIntensityMap].filter(Boolean)).forEach((texture) => texture?.dispose())
            const facePaintMap = item.userData.facePaintMap
            if (facePaintMap instanceof THREE.Texture) facePaintMap.dispose()
            const paletteMaskMap = item.userData.paletteMaskMap
            if (paletteMaskMap instanceof THREE.Texture) paletteMaskMap.dispose()
            const lipMaskMap = item.userData.lipMaskMap
            if (lipMaskMap instanceof THREE.Texture) lipMaskMap.dispose()
          }
          item.dispose()
        })
      })
      scene.environment = null
      environmentTexture.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [
    source,
    equipped,
    raceCode,
    customization.face,
    customization.hairstyle,
    customization.tribeId,
    customization.gender,
    customization.bustSize,
    customization.muscleTone,
    customization.jaw,
    customization.eyeShape,
    customization.irisSize,
    customization.eyebrows,
    customization.nose,
    customization.mouth,
    customization.facialFeatures,
    customization.tattoos,
    // facePaint toggles the decal geometry/texture, so it still triggers a rebuild.
    customization.facePaint,
    // Appearance COLORS are intentionally omitted: they are pure tints applied
    // live by the color effect below, so changing a picker must not tear down and
    // reload the whole character (which recreated the WebGL context every tick and
    // eventually stopped updating). The rebuild still reads the current colors for
    // the initial tint because it runs on the other dependencies with fresh props.
  ])

  // Retint the already-built character materials when an appearance color
  // changes — cheap, and it avoids the full character rebuild that made color
  // changes appear to do nothing. Runs after the current character is built;
  // during the initial async load the list is empty and the build sets colors.
  useEffect(() => {
    for (const apply of customizationAppliers.current) apply(customization)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    customization.skinColor,
    customization.hairColor,
    customization.eyeColor,
    customization.lipColor,
    customization.tattooColor,
    customization.facePaint,
    customization.facePaintColor,
  ])

  return (
    <div className="viewer-canvas-wrap">
      <div className="viewer-canvas" ref={container} aria-label="Three-dimensional FFXIV character and armor inspection view" />
      {previewItems.length > 0 && (
        <details className="viewer-selection" aria-label="Selected preview armor">
          <summary title="Show or hide equipped geometry details">
            <strong>Previewing geometry</strong>
            <span className="viewer-selection-count">{previewItems.length}</span>
          </summary>
          <div className="viewer-selection-body">
            {previewItems.map(([slot, item]) => (
              <span key={slot}>
                {slot}: {item.name}
                <small>{equipmentAssetPlan(item, raceCode).objectType} {item.modelSet.toString().padStart(4, '0')} v{item.modelVariant.toString().padStart(4, '0')}</small>
                {item.dyes?.some(Boolean) && <small>{item.dyes.map((dye, index) => dye ? `Dye ${index + 1}: ${dye.name}` : null).filter(Boolean).join(' · ')}</small>}
              </span>
            ))}
            <em>Local mode resolves IMC parts, SKLB skinning, MTRL color tables, and TEX/PBR textures.</em>
          </div>
        </details>
      )}
      <div className={`viewer-animation-controls ${idleState}`} aria-label="Animation controls">
        <span className="viewer-animation-label" title={idleLabel}>
          <i aria-hidden="true" />
          {idleState === 'loading' ? 'Loading idle…' : idleState === 'unavailable' ? 'Idle unavailable' : idleLabel}
        </span>
        <button
          type="button"
          onClick={startIdle}
          disabled={!idleAction.current || idleState === 'loading' || idleState === 'playing' || idleState === 'unavailable'}
          title={source.kind === 'local' ? 'Start or resume the current animation' : 'Animations require Local install mode'}
        >
          Start
        </button>
        <button
          type="button"
          onClick={pauseIdle}
          disabled={!idleAction.current || idleState !== 'playing'}
          title="Pause the current animation"
        >
          Pause
        </button>
        <button
          type="button"
          onClick={() => resetView.current?.()}
          title="Fit the complete character in the preview"
        >
          Fit
        </button>
        {source.kind === 'local' && (
          <button
            type="button"
            onClick={() => motionInput.current?.click()}
            disabled={animBusy || idleState === 'loading' || idleState === 'unavailable'}
            title="Load a glTF/GLB motion (e.g. a Meddle export) and retarget it onto this character by bone name"
          >
            Load motion…
          </button>
        )}
      </div>
      <input
        ref={motionInput}
        type="file"
        accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
        hidden
        onChange={onMotionFile}
      />
      {source.kind === 'local' && (
        <AnimationPicker
          activeId={activeAnimId}
          activeLabel={idleLabel}
          busy={animBusy}
          notice={animNotice}
          debug={animDiag}
          onSelect={onSelectAnimation}
          onDownloadSource={activeAnimId ? onDownloadSource : undefined}
        />
      )}
      <p className="viewer-status" aria-live="polite">{status}</p>
      {error && (
        <details className="viewer-error">
          <summary>Some character assets did not load</summary>
          <button
            className="viewer-copy-debug"
            type="button"
            onClick={() => void navigator.clipboard.writeText(error)}
          >
            Copy debug report
          </button>
          <pre>{error}</pre>
        </details>
      )}
      {!error && debug && (
        <details className="viewer-debug">
          <summary>Material, body, and eye debug report</summary>
          <button
            className="viewer-copy-debug"
            type="button"
            onClick={() => void navigator.clipboard.writeText(debug)}
          >
            Copy debug report
          </button>
          <pre>{debug}</pre>
        </details>
      )}
    </div>
  )
}
