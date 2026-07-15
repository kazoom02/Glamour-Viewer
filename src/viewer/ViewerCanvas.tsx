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
  hairSkeletonPath,
  skeletonPath,
  type CharacterPart,
  type CharacterRaceCode,
} from '../asset-source/characterPlan'
import { equipmentAssetPlan } from '../asset-source/equipmentPlan'
import { loadLocalMaterials, type DecodedMaterial, type MaterialLoadRequest } from '../asset-source/materialLoader'
import { loadLocalModels, type ModelLoadResult } from '../asset-source/modelLoader'
import type { DecodedModel } from '../asset-source/mdl'
import {
  isMissingLocalSkeletonError,
  loadLocalSkeleton,
  type DecodedSkeleton,
} from '../asset-source/skeletonLoader'
import { attachSkeleton } from '../asset-source/sklb'
import { ARMOR_SLOTS, type ArmorSlot, type EquippedArmor } from '../catalog/types'

interface ViewerCanvasProps {
  source: AssetSource
  equipped: EquippedArmor
  raceCode: CharacterRaceCode
}

const SLOT_COLORS: Record<ArmorSlot, number> = {
  head: 0xd5b36f, body: 0xa6804f, hands: 0x8f7557, legs: 0x7a6651, feet: 0x63584b,
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

interface CharacterRig {
  skeleton: THREE.Skeleton
  boneIndex: Map<string, number>
}

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

function addDecodedModel(
  target: THREE.Group,
  model: DecodedModel,
  color: number,
  label: string,
  decodedMaterials: Record<string, DecodedMaterial> = {},
  attributeMask?: number,
  slot?: ArmorSlot,
  rig?: CharacterRig,
  anisotropy = 1,
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
    const normal = decodedMaterial?.textures.normal
    const ao = decodedMaterial?.textures.ao
    const roughness = decodedMaterial?.textures.roughness
    const metalness = decodedMaterial?.textures.metalness
    const emissive = decodedMaterial?.textures.emissive
    const alphaMode = decodedMaterial?.alphaMode ?? 'opaque'
    const isIris = decodedMaterial?.shaderPackage.toLowerCase() === 'iris.shpk' || /_iri_[a-z]\.mtrl$/.test(materialPath)
    const isFaceMaterial = /mt_c\d{4}f\d{4}/.test(materialPath)
    const fallbackRoughness = shaderPackage === 'skin.shpk'
      ? 0.72
      : shaderPackage === 'hair.shpk'
        ? 0.64
        : shaderPackage === 'iris.shpk'
          ? 0.46
          : 0.68
    const material = new THREE.MeshStandardMaterial({
      color: diffuse ? 0xffffff : meshColor,
      map: diffuse ? textureFromDecoded(diffuse, true, anisotropy) : null,
      normalMap: normal ? textureFromDecoded(normal, false, anisotropy) : null,
      aoMap: ao ? textureFromDecoded(ao, false, anisotropy) : null,
      aoMapIntensity: ao ? 0.65 : 1,
      roughnessMap: roughness ? textureFromDecoded(roughness, false, anisotropy) : null,
      roughness: roughness ? 1 : fallbackRoughness,
      metalnessMap: metalness ? textureFromDecoded(metalness, false, anisotropy) : null,
      metalness: metalness ? 1 : materialPath.includes('/mt_c') && materialPath.includes('e0000') ? 0 : 0.08,
      emissiveMap: emissive ? textureFromDecoded(emissive, true, anisotropy) : null,
      emissive: emissive ? 0xffffff : 0x000000,
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

const ATTRIBUTE_PREFIX: Record<ArmorSlot, string> = {
  head: 'atr_mv_', body: 'atr_tv_', hands: 'atr_gv_', legs: 'atr_dv_', feet: 'atr_sv_',
}

function isVisibleEquipmentPart(attributes: string[] | undefined, slot: ArmorSlot, mask: number): boolean {
  const prefix = ATTRIBUTE_PREFIX[slot]
  const variants = attributes?.filter((attribute) => attribute.toLowerCase().startsWith(prefix)) ?? []
  if (!variants.length) return true
  return variants.some((attribute) => {
    const index = attribute.toLowerCase().charCodeAt(prefix.length) - 97
    return index >= 0 && index < 10 && (mask & (1 << index)) !== 0
  })
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
  return model.meshes.flatMap((mesh, index) => {
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

export default function ViewerCanvas({ source, equipped, raceCode }: ViewerCanvasProps) {
  const container = useRef<HTMLDivElement>(null)
  const previewItems = ARMOR_SLOTS.flatMap((slot) => equipped[slot] ? [[slot, equipped[slot]!] as const] : [])
  const [status, setStatus] = useState('Loading character…')
  const [error, setError] = useState<string>()
  const [debug, setDebug] = useState<string>()

  useEffect(() => {
    const host = container.current
    if (!host) return
    let disposed = false

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 100)
    camera.position.set(0.2, 1.05, 4)
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.12
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

    scene.add(new THREE.HemisphereLight(0xf4e8d5, 0x171a22, 2.3))
    const key = new THREE.DirectionalLight(0xffd9a0, 3.8)
    key.position.set(3, 5, 4)
    scene.add(key)
    const rim = new THREE.DirectionalLight(0x8db6ff, 1.6)
    rim.position.set(-4, 2, -3)
    scene.add(rim)

    const allCharacterPlans = characterModelPlan(raceCode)
    const selected = (Object.entries(equipped) as Array<[ArmorSlot, EquippedArmor[ArmorSlot]]>)
      .filter((entry): entry is [ArmorSlot, NonNullable<EquippedArmor[ArmorSlot]>] => Boolean(entry[1]))
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
          const optionalHairSkeletonPath = hairSkeletonPath(raceCode)
          try {
            const hairSkeleton = await loadLocalSkeleton(source, optionalHairSkeletonPath)
            combinedSkeleton = attachSkeleton(combinedSkeleton, hairSkeleton, 'j_kao')
          } catch (reason) {
            if (!isMissingLocalSkeletonError(reason, optionalHairSkeletonPath)) {
              failures.push(`hair skeleton: ${reason instanceof Error ? reason.message : String(reason)}`)
            }
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
          rig = addCharacterRig(characterGroup, combinedSkeleton)
        } catch (reason) {
          failures.push(`base skeleton: ${reason instanceof Error ? reason.message : String(reason)}`)
        }
        const paths = [...new Set([
          ...characterPlans.flatMap(characterModelCandidates),
          ...equipmentPlans.flatMap((plan) => plan.candidates),
        ])]
        const byPath = resultMap(await loadLocalModels(source, paths))
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
            )
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
            addDecodedModel(
              characterGroup,
              result.model,
              SLOT_COLORS[plan.slot],
              `equipment-${plan.slot}`,
              materialResult?.materials,
              materialResult?.attributeMask,
              plan.slot,
              rig,
              maxAnisotropy,
            )
            if (materialResult?.errors.length) failures.push(...materialResult.errors.map((error) => `${plan.item.name} ${error}`))
            diagnostics.push(...modelMaterialDiagnostics(plan.item.name, result.model, materialResult, true))
            equippedItems += 1
          } else {
            const attempted = plan.candidates.map((path) => byPath.get(path)?.error).filter(Boolean).join(' / ')
            failures.push(`${plan.item.name}: ${attempted || 'model not found'}`)
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
        ? `${raceCode} ${rig ? 'skinned' : 'bind-pose'} character · ${equippedItems}/${selected.length} equipped · drag to rotate`
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
    const render = () => {
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
      scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return
        object.geometry.dispose()
        const materials = Array.isArray(object.material) ? object.material : [object.material]
        materials.forEach((item) => {
          if (item instanceof THREE.MeshStandardMaterial) {
            new Set([item.map, item.normalMap, item.aoMap, item.roughnessMap, item.metalnessMap, item.emissiveMap].filter(Boolean)).forEach((texture) => texture?.dispose())
          }
          item.dispose()
        })
      })
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [source, equipped, raceCode])

  return (
    <div className="viewer-canvas-wrap">
      <div className="viewer-canvas" ref={container} aria-label="Three-dimensional FFXIV character and armor inspection view" />
      {previewItems.length > 0 && (
        <div className="viewer-selection" aria-label="Selected preview armor">
          <strong>Previewing geometry</strong>
          {previewItems.map(([slot, item]) => (
            <span key={slot}>
              {slot}: {item.name}
              <small>e{item.modelSet.toString().padStart(4, '0')} v{item.modelVariant.toString().padStart(4, '0')}</small>
            </span>
          ))}
          <em>Local mode resolves IMC parts, SKLB skinning, MTRL color tables, and TEX/PBR textures.</em>
        </div>
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
