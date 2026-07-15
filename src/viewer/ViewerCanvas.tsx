import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { AssetSource } from '../asset-source/types'
import {
  characterModelPlan,
  equipmentModelCandidates,
  skeletonPath,
  type CharacterPart,
  type CharacterRaceCode,
} from '../asset-source/characterPlan'
import { equipmentAssetPlan } from '../asset-source/equipmentPlan'
import { loadLocalMaterials, type DecodedMaterial, type MaterialLoadRequest } from '../asset-source/materialLoader'
import { loadLocalModels, type ModelLoadResult } from '../asset-source/modelLoader'
import type { DecodedModel } from '../asset-source/mdl'
import { loadLocalSkeleton, type DecodedSkeleton } from '../asset-source/skeletonLoader'
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

function textureFromDecoded(texture: NonNullable<DecodedMaterial['textures']['diffuse']>, color: boolean): THREE.DataTexture {
  const result = new THREE.DataTexture(texture.rgba, texture.width, texture.height, THREE.RGBAFormat, THREE.UnsignedByteType)
  result.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace
  result.wrapS = THREE.RepeatWrapping
  result.wrapT = THREE.RepeatWrapping
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
): number {
  for (const [index, part] of model.meshes.entries()) {
    if (slot && attributeMask !== undefined && !isVisibleEquipmentPart(part.attributes, slot, attributeMask)) continue
    const materialPath = model.materialPaths[part.materialIndex]?.toLowerCase() ?? ''
    const decodedMaterial = decodedMaterials[materialPath.replaceAll('\\', '/')]
    let meshColor = color
    if (/b0001_[a-z]\.mtrl$/.test(materialPath) || /_fac_[a-z]\.mtrl$/.test(materialPath)) meshColor = 0xc99378
    else if (/_iri_[a-z]\.mtrl$/.test(materialPath)) meshColor = 0x6689a7
    else if (/_etc_[a-z]\.mtrl$/.test(materialPath)) meshColor = 0xe7ded2
    else if (/_hir_[a-z]\.mtrl$/.test(materialPath)) meshColor = 0x352a2b
    else if (/_acc_[a-z]\.mtrl$/.test(materialPath)) meshColor = 0x8b6a45
    else if (/e0000_(top|dwn|sho|glv)_/.test(materialPath)) meshColor = 0x554b49
    const diffuse = decodedMaterial?.textures.diffuse
    const normal = decodedMaterial?.textures.normal
    const mask = decodedMaterial?.textures.mask
    const roughness = decodedMaterial?.textures.roughness ?? mask
    const metalness = decodedMaterial?.textures.metalness
    const emissive = decodedMaterial?.textures.emissive
    const material = new THREE.MeshStandardMaterial({
      color: diffuse ? 0xffffff : meshColor,
      map: diffuse ? textureFromDecoded(diffuse, true) : null,
      normalMap: normal ? textureFromDecoded(normal, false) : null,
      roughnessMap: roughness ? textureFromDecoded(roughness, false) : null,
      roughness: roughness ? 1 : 0.62,
      metalnessMap: metalness ? textureFromDecoded(metalness, false) : null,
      metalness: metalness ? 1 : materialPath.includes('/mt_c') && materialPath.includes('e0000') ? 0 : 0.08,
      emissiveMap: emissive ? textureFromDecoded(emissive, true) : null,
      emissive: emissive ? 0xffffff : 0x000000,
      alphaTest: diffuse ? 0.08 : 0,
      side: THREE.DoubleSide,
    })
    if (normal) material.normalScale.set(1, 1)
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(part.positions, 3))
    if (part.uvs) geometry.setAttribute('uv', new THREE.BufferAttribute(part.uvs, 2))
    let skinIndices = part.skinIndices
    if (skinIndices && rig) {
      skinIndices = new Uint16Array(skinIndices).map((globalIndex) => (
        rig.boneIndex.get(model.boneNames[globalIndex] ?? '') ?? 0
      ))
    }
    if (skinIndices) geometry.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndices, 4))
    if (part.skinWeights) geometry.setAttribute('skinWeight', new THREE.BufferAttribute(part.skinWeights, 4))
    geometry.setIndex(new THREE.BufferAttribute(part.indices, 1))
    // Use stable geometric vertex normals under the decoded normal map. Some packed
    // MDL normals need shader-specific handling and otherwise create dark triangles.
    geometry.computeVertexNormals()
    geometry.normalizeNormals()
    geometry.computeBoundingBox()
    geometry.computeBoundingSphere()
    const mesh = rig && skinIndices && part.skinWeights
      ? new THREE.SkinnedMesh(geometry, material)
      : new THREE.Mesh(geometry, material)
    mesh.name = `${label}-${index}`
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

async function diagnosticReport(source: AssetSource, failures: string[]): Promise<string> {
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
    ...failures,
  ].join('\n')
}

export default function ViewerCanvas({ source, equipped, raceCode }: ViewerCanvasProps) {
  const container = useRef<HTMLDivElement>(null)
  const previewItems = ARMOR_SLOTS.flatMap((slot) => equipped[slot] ? [[slot, equipped[slot]!] as const] : [])
  const [status, setStatus] = useState('Loading character…')
  const [error, setError] = useState<string>()

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
    setStatus(`Reading ${raceCode} character models…`)

    void (async () => {
      const failures: string[] = []
      let characterParts = 0
      let equippedItems = 0
      let rig: CharacterRig | undefined
      if (source.kind === 'local') {
        try {
          setStatus(`Reading ${raceCode} skeleton and character models…`)
          rig = addCharacterRig(characterGroup, await loadLocalSkeleton(source, skeletonPath(raceCode)))
        } catch (reason) {
          failures.push(`skeleton: ${reason instanceof Error ? reason.message : String(reason)}`)
        }
        const paths = [...new Set([
          ...characterPlans.map((plan) => plan.path),
          ...equipmentPlans.flatMap((plan) => plan.candidates),
        ])]
        const byPath = resultMap(await loadLocalModels(source, paths))
        if (disposed) return

        const characterModels = characterPlans.flatMap((plan) => {
          const result = byPath.get(plan.path)
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

        for (const plan of characterPlans) {
          const result = byPath.get(plan.path)
          if (result?.model) {
            const materialResult = materialsByModel.get(result.path)
            addDecodedModel(characterGroup, result.model, PART_COLORS[plan.part], `character-${plan.part}`, materialResult?.materials, undefined, undefined, rig)
            if (materialResult?.errors.length) failures.push(...materialResult.errors.map((error) => `${plan.part} ${error}`))
            characterParts += 1
          } else {
            failures.push(`${plan.part}: ${result?.error || 'model not found'}`)
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
            )
            if (materialResult?.errors.length) failures.push(...materialResult.errors.map((error) => `${plan.item.name} ${error}`))
            equippedItems += 1
          } else {
            const attempted = plan.candidates.map((path) => byPath.get(path)?.error).filter(Boolean).join(' / ')
            failures.push(`${plan.item.name}: ${attempted || 'model not found'}`)
          }
        }
      } else {
        for (const plan of characterPlans) {
          try {
            characterGroup.add(await loadRemoteModel(source, plan.path))
            characterParts += 1
          } catch (reason) {
            failures.push(`${plan.part}: ${reason instanceof Error ? reason.message : 'model not found'}`)
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
      if (failures.length) {
        const report = await diagnosticReport(source, failures)
        if (!disposed) setError(report)
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
            new Set([item.map, item.normalMap, item.roughnessMap, item.metalnessMap, item.emissiveMap].filter(Boolean)).forEach((texture) => texture?.dispose())
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
    </div>
  )
}
