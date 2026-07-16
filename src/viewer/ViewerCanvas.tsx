import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { AssetSource } from '../asset-source/types'
import {
  auxiliarySkeletonPlan,
  characterModelCandidates,
  characterModelPlan,
  equipmentModelCandidates,
  faceSkeletonCandidates,
  idleAnimationCandidates,
  skeletonPath,
  type CharacterPart,
  type CharacterRaceCode,
} from '../asset-source/characterPlan'
import { loadLocalIdleAnimation, type DecodedAnimation } from '../asset-source/animationLoader'
import { equipmentAssetPlan } from '../asset-source/equipmentPlan'
import { loadLocalMaterials, type DecodedMaterial, type MaterialLoadRequest } from '../asset-source/materialLoader'
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
  type EquipmentSlot,
  type EquippedArmor,
} from '../catalog/types'
import type { CharacterCustomization } from '../customization/types'
import { animationClipFromDecoded } from './idleAnimation'

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

function addCharacterRig(target: THREE.Group, decoded: DecodedSkeleton): CharacterRig {
  const bones = decoded.bones.map((source) => {
    const bone = new THREE.Bone()
    bone.name = source.name
    bone.position.fromArray(source.translation)
    bone.quaternion.fromArray(source.rotation).normalize()
    bone.scale.fromArray(source.scale)
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
  return { skeleton, boneIndex: new Map(bones.map((bone, index) => [bone.name, index])) }
}

function colorNumber(value: string, fallback = 0xffffff): number {
  return /^#[0-9a-f]{6}$/i.test(value) ? Number.parseInt(value.slice(1), 16) : fallback
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
): number {
  for (const [index, part] of model.meshes.entries()) {
    if (slot && attributeMask !== undefined && !isVisibleEquipmentPart(part.attributes, slot, attributeMask)) continue
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
    let materialTint = 0xffffff
    if (customization) {
      if (isIris) materialTint = colorNumber(customization.eyeColor)
      else if (/_hir_[a-z]\.mtrl$/.test(materialPath) || shaderPackage === 'hair.shpk') materialTint = colorNumber(customization.hairColor)
      else if (shaderPackage.includes('tattoo') || /_etc_[a-z]\.mtrl$/.test(materialPath)) {
        materialTint = colorNumber(customization.facePaint ? customization.facePaintColor : customization.tattooColor)
      } else if (shaderPackage === 'skin.shpk' || /b0001_[a-z]\.mtrl$/.test(materialPath) || isFaceMaterial) {
        materialTint = colorNumber(customization.skinColor)
      }
    }
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
    const aoMap = ao
      ? textureFromDecoded(ao, false, anisotropy)
      : mask
        ? textureFromChannel(mask, 2, 'rgb', anisotropy)
        : null
    const roughnessMap = roughness
      ? textureFromDecoded(roughness, false, anisotropy)
      : mask
        ? textureFromDecoded(mask, false, anisotropy)
        : null
    const specularIntensityMap = specularIntensity
      ? textureFromDecoded(specularIntensity, false, anisotropy)
      : mask
        ? textureFromChannel(mask, 0, 'alpha', anisotropy)
        : null
    const material = new THREE.MeshPhysicalMaterial({
      color: diffuse ? materialTint : meshColor,
      map: diffuse ? textureFromDecoded(diffuse, true, anisotropy) : null,
      normalMap: normal ? textureFromDecoded(normal, false, anisotropy) : null,
      aoMap,
      aoMapIntensity: aoMap ? 0.65 : 1,
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
      specularIntensity: specularIntensityMap ? 1 : fallbackSpecularIntensity,
      ior: 1.5,
      clearcoat: 0,
      sheen: 0,
      alphaTest: diffuse && alphaMode === 'mask' ? 0.5 : 0,
      transparent: alphaMode === 'blend',
      depthWrite: alphaMode !== 'blend',
      side: isFaceMaterial ? THREE.FrontSide : THREE.DoubleSide,
      polygonOffset: isIris,
      polygonOffsetFactor: isIris ? -1 : 0,
      polygonOffsetUnits: isIris ? -1 : 0,
    })
    if (normal) material.normalScale.set(1, 1)
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(part.positions, 3))
    if (part.uvs) {
      geometry.setAttribute('uv', new THREE.BufferAttribute(part.uvs, 2))
      geometry.setAttribute('uv1', new THREE.BufferAttribute(part.uvs, 2))
    }
    if (part.uvs2) geometry.setAttribute('uv2', new THREE.BufferAttribute(part.uvs2, 2))
    let skinIndices = part.skinIndices
    if (skinIndices && rig) {
      skinIndices = new Uint16Array(skinIndices).map((globalIndex) => (
        rig.boneIndex.get(model.boneNames[globalIndex] ?? '') ?? 0
      ))
    }
    if (skinIndices) geometry.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndices, 4))
    if (part.skinWeights) geometry.setAttribute('skinWeight', new THREE.BufferAttribute(part.skinWeights, 4))
    geometry.setIndex(new THREE.BufferAttribute(part.indices, 1))
    // FFXIV's authored normals preserve smoothing across material submeshes. Recomputing
    // them independently makes the face look faceted at every material boundary.
    if (part.normals?.every(Number.isFinite)) geometry.setAttribute('normal', new THREE.BufferAttribute(part.normals, 3))
    else geometry.computeVertexNormals()
    geometry.normalizeNormals()
    geometry.computeBoundingBox()
    geometry.computeBoundingSphere()
    const mesh = rig && skinIndices && part.skinWeights
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

function equipmentTarget(character: THREE.Group, rig: CharacterRig | undefined, slot: EquipmentSlot): THREE.Object3D {
  if (!rig || !isWeaponSlot(slot)) return character
  const names = slot === 'mainHand'
    ? ['j_buki_r', 'n_buki_r', 'j_te_r', 'j_hand_r']
    : ['j_buki_l', 'n_buki_l', 'j_te_l', 'j_hand_l']
  return names.map((name) => rig.skeleton.bones.find((bone) => bone.name === name)).find(Boolean) ?? character
}

function fitCamera(camera: THREE.PerspectiveCamera, controls: OrbitControls, object: THREE.Object3D) {
  const box = new THREE.Box3().setFromObject(object)
  if (box.isEmpty()) return
  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  const radius = Math.max(size.x, size.y, size.z, 0.8)
  controls.target.copy(center)
  camera.position.set(center.x + radius * 0.18, center.y + radius * 0.08, center.z + radius * 1.9)
  camera.near = Math.max(radius / 100, 0.01)
  camera.far = Math.max(radius * 20, 50)
  camera.updateProjectionMatrix()
  controls.update()
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
    ? ` · PBD c${deformation.sourceRaceCode.toString().padStart(4, '0')}→c${deformation.targetRaceCode.toString().padStart(4, '0')} steps=${deformation.steps} matrixBones=${deformation.matrixBones} vertices=${deformation.vertices}`
    : ' · native race geometry'}`
  const meshes = model.meshes.flatMap((mesh, index) => {
    const reference = model.materialPaths[mesh.materialIndex]?.replaceAll('\\', '/').toLowerCase() ?? '(missing)'
    const material = materialResult?.materials[reference]
    const face = label === 'character face'
    const iris = material?.shaderPackage.toLowerCase() === 'iris.shpk' || reference.includes('_iri_')
    if (!equipment && !face && !iris) return []
    return [
      `${label} mesh ${index}: materialIndex=${mesh.materialIndex} reference=${reference}`,
      `  shader=${material?.shaderPackage ?? 'unresolved'} vertices=${mesh.positions.length / 3} triangles=${mesh.indices.length / 3}`,
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
  const previewItems = EQUIPMENT_SLOTS.flatMap((slot) => equipped[slot] ? [[slot, equipped[slot]!] as const] : [])
  const [status, setStatus] = useState('Loading character…')
  const [error, setError] = useState<string>()
  const [debug, setDebug] = useState<string>()
  const [idleState, setIdleState] = useState<IdleAnimationState>(source.kind === 'local' ? 'loading' : 'unavailable')
  const [idleLabel, setIdleLabel] = useState('Idle')

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
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 3))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.NeutralToneMapping
    renderer.toneMappingExposure = 1
    const maxAnisotropy = renderer.capabilities.getMaxAnisotropy()
    host.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.target.set(0, 0.95, 0)
    controls.minDistance = 0.25
    controls.maxDistance = 12
    const fallback = addFallbackMannequin(scene)
    const characterGroup = new THREE.Group()
    characterGroup.name = `${raceCode}-character`
    scene.add(characterGroup)
    let activeIdleMixer: THREE.AnimationMixer | undefined
    idleAction.current = null
    idleMixer.current = null
    setIdleLabel('Idle')
    setIdleState(source.kind === 'local' ? 'loading' : 'unavailable')

    scene.add(new THREE.HemisphereLight(0xffffff, 0x20242c, 1.35))
    const key = new THREE.DirectionalLight(0xffffff, 2.4)
    key.position.set(3, 5, 4)
    scene.add(key)
    const rim = new THREE.DirectionalLight(0xffffff, 0.65)
    rim.position.set(-4, 2, -3)
    scene.add(rim)

    const allCharacterPlans = characterModelPlan(raceCode, { faceId: customization.face, hairId: customization.hairstyle })
    const selected = (Object.entries(equipped) as Array<[EquipmentSlot, EquippedArmor[EquipmentSlot]]>)
      .filter((entry): entry is [EquipmentSlot, NonNullable<EquippedArmor[EquipmentSlot]>] => Boolean(entry[1]))
    const equipmentPlans = selected.map(([slot, item]) => ({
      slot,
      item,
      asset: equipmentAssetPlan(item, raceCode),
      candidates: equipmentModelCandidates(item, raceCode),
    }))
    const characterPlans = allCharacterPlans.filter((plan) => !plan.coveredBy || !equipped[plan.coveredBy])
    setError(undefined)
    setDebug(undefined)
    setStatus(`Reading ${raceCode} character models…`)

    void (async () => {
      const failures: string[] = []
      const diagnostics: string[] = []
      let characterParts = 0
      let equippedItems = 0
      let rig: CharacterRig | undefined
      let decodedSkeleton: DecodedSkeleton | undefined
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
          rig = addCharacterRig(characterGroup, combinedSkeleton)
          idleAnimationPromise = loadLocalIdleAnimation(source, idleAnimationCandidates(raceCode))
        } catch (reason) {
          failures.push(`base skeleton: ${reason instanceof Error ? reason.message : String(reason)}`)
          setIdleState('unavailable')
        }
        const paths = [...new Set([
          ...characterPlans.flatMap(characterModelCandidates),
          ...equipmentPlans.flatMap((plan) => plan.candidates),
        ])]
        const byPath = resultMap(await loadLocalModels(source, paths, decodedSkeleton ? {
          targetRaceCode: raceCode,
          skeleton: decodedSkeleton,
        } : undefined))
        if (disposed) return

        const characterModels = characterPlans.flatMap((plan) => {
          const result = characterModelCandidates(plan).map((path) => byPath.get(path)).find((candidate) => candidate?.model)
          return result?.model ? [{ plan, result: result as Required<Pick<ModelLoadResult, 'path' | 'model'>> }] : []
        })
        const equipmentModels = equipmentPlans.flatMap((plan) => {
          const result = plan.candidates.map((path) => byPath.get(path)).find((candidate) => candidate?.model)
          return result?.model ? [{ plan, result: result as Required<Pick<ModelLoadResult, 'path' | 'model'>> }] : []
        })
        const materialRequests: MaterialLoadRequest[] = [
          ...characterModels.map(({ result }) => ({
            modelPath: result.path,
            materialPaths: result.model.materialPaths,
          })),
          ...equipmentModels.map(({ plan, result }) => ({
            modelPath: result.path,
            materialPaths: result.model.materialPaths,
            imcPath: plan.asset.imcPath,
            slot: plan.slot,
            variant: plan.asset.variant,
            stains: [plan.item.dyes?.[0]?.id ?? 0, plan.item.dyes?.[1]?.id ?? 0],
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
        diagnostics.push(...materialResults.flatMap((result) => result.diagnostics))

        for (const plan of characterPlans) {
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
        for (const plan of equipmentPlans) {
          const result = plan.candidates.map((path) => byPath.get(path)).find((candidate) => candidate?.model)
          if (result?.model) {
            const materialResult = materialsByModel.get(result.path)
            const weapon = isWeaponSlot(plan.slot)
            addDecodedModel(
              equipmentTarget(characterGroup, rig, plan.slot),
              result.model,
              SLOT_COLORS[plan.slot],
              `equipment-${plan.slot}`,
              materialResult?.materials,
              materialResult?.attributeMask,
              plan.slot,
              weapon ? undefined : rig,
              maxAnisotropy,
            )
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
            const clip = animationClipFromDecoded(decodedAnimation, rig.skeleton)
            activeIdleMixer = new THREE.AnimationMixer(characterGroup)
            const action = activeIdleMixer.clipAction(clip)
            action.setLoop(THREE.LoopRepeat, Infinity)
            action.clampWhenFinished = false
            action.setEffectiveWeight(1)
            action.setEffectiveTimeScale(1)
            // Apply frame zero immediately so the preview starts in the authored
            // standing pose instead of snapping out of the bind-pose T stance.
            action.play()
            activeIdleMixer.update(0)
            action.paused = true
            idleMixer.current = activeIdleMixer
            idleAction.current = action
            idleReady = true
            setIdleLabel(decodedAnimation.name || 'Idle')
            setIdleState('ready')
            diagnostics.push(
              `idle animation: ${decodedAnimation.path} name=${decodedAnimation.name} blend=${decodedAnimation.blendHint} duration=${decodedAnimation.duration.toFixed(3)}s frames=${decodedAnimation.times.length} tracks=${decodedAnimation.tracks.length} rootTranslation=stabilized`,
            )
          } catch (reason) {
            const detail = reason instanceof Error ? reason.message : String(reason)
            failures.push(`idle animation: ${detail}`)
            setIdleState('unavailable')
          }
        }
      } else {
        for (const plan of characterPlans) {
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
      if (characterParts || equippedItems) fitCamera(camera, controls, characterGroup)
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
    const render = () => {
      activeIdleMixer?.update(Math.min(clock.getDelta(), 0.1))
      controls.update()
      renderer.render(scene, camera)
      frame = requestAnimationFrame(render)
    }
    render()

    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      observer.disconnect()
      controls.dispose()
      activeIdleMixer?.stopAllAction()
      if (idleMixer.current === activeIdleMixer) {
        idleMixer.current = null
        idleAction.current = null
      }
      scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return
        object.geometry.dispose()
        const materials = Array.isArray(object.material) ? object.material : [object.material]
        materials.forEach((item) => {
          if (item instanceof THREE.MeshStandardMaterial) {
            new Set([item.map, item.normalMap, item.aoMap, item.roughnessMap, item.metalnessMap, item.emissiveMap].filter(Boolean)).forEach((texture) => texture?.dispose())
          }
          if (item instanceof THREE.MeshPhysicalMaterial) {
            new Set([item.specularColorMap, item.specularIntensityMap].filter(Boolean)).forEach((texture) => texture?.dispose())
          }
          item.dispose()
        })
      })
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [
    source,
    equipped,
    raceCode,
    customization.face,
    customization.hairstyle,
    customization.skinColor,
    customization.hairColor,
    customization.eyeColor,
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
      <div className={`viewer-animation-controls ${idleState}`} aria-label="Idle animation controls">
        <span className="viewer-animation-label" title={idleLabel}>
          <i aria-hidden="true" />
          {idleState === 'loading' ? 'Loading idle…' : idleState === 'unavailable' ? 'Idle unavailable' : idleLabel}
        </span>
        <button
          type="button"
          onClick={startIdle}
          disabled={!idleAction.current || idleState === 'loading' || idleState === 'playing' || idleState === 'unavailable'}
          title={source.kind === 'local' ? 'Start or resume the character idle animation' : 'Idle animation requires Local install mode'}
        >
          Start
        </button>
        <button
          type="button"
          onClick={pauseIdle}
          disabled={!idleAction.current || idleState !== 'playing'}
          title="Pause the character idle animation"
        >
          Pause
        </button>
      </div>
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
          <summary>Material and eye debug report</summary>
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
