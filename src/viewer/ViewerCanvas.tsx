import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { AssetSource } from '../asset-source/types'
import {
  characterModelPlan,
  equipmentModelCandidates,
  type CharacterPart,
  type CharacterRaceCode,
} from '../asset-source/characterPlan'
import { loadLocalModels, type ModelLoadResult } from '../asset-source/modelLoader'
import type { DecodedModel } from '../asset-source/mdl'
import type { ArmorSlot, EquippedArmor } from '../catalog/types'

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

function addDecodedModel(target: THREE.Group, model: DecodedModel, color: number, label: string): number {
  for (const [index, part] of model.meshes.entries()) {
    const materialPath = model.materialPaths[part.materialIndex]?.toLowerCase() ?? ''
    let meshColor = color
    if (/b0001_[a-z]\.mtrl$/.test(materialPath) || /_fac_[a-z]\.mtrl$/.test(materialPath)) meshColor = 0xc99378
    else if (/_iri_[a-z]\.mtrl$/.test(materialPath)) meshColor = 0x6689a7
    else if (/_etc_[a-z]\.mtrl$/.test(materialPath)) meshColor = 0xe7ded2
    else if (/_hir_[a-z]\.mtrl$/.test(materialPath)) meshColor = 0x352a2b
    else if (/_acc_[a-z]\.mtrl$/.test(materialPath)) meshColor = 0x8b6a45
    else if (/e0000_(top|dwn|sho|glv)_/.test(materialPath)) meshColor = 0x554b49
    const material = new THREE.MeshStandardMaterial({
      color: meshColor, roughness: 0.62, metalness: materialPath.includes('/mt_c') && materialPath.includes('e0000') ? 0 : 0.08,
      side: THREE.DoubleSide,
    })
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(part.positions, 3))
    if (part.normals) geometry.setAttribute('normal', new THREE.BufferAttribute(part.normals, 3))
    else geometry.computeVertexNormals()
    if (part.uvs) geometry.setAttribute('uv', new THREE.BufferAttribute(part.uvs, 2))
    if (part.skinIndices) geometry.setAttribute('skinIndex', new THREE.BufferAttribute(part.skinIndices, 4))
    if (part.skinWeights) geometry.setAttribute('skinWeight', new THREE.BufferAttribute(part.skinWeights, 4))
    geometry.setIndex(new THREE.BufferAttribute(part.indices, 1))
    geometry.computeBoundingBox()
    geometry.computeBoundingSphere()
    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = `${label}-${index}`
    target.add(mesh)
  }
  return model.meshes.length
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
  const result = await new GLTFLoader().loadAsync(new URL(convertedPath, source.baseUrl).toString())
  return result.scene
}

function resultMap(results: ModelLoadResult[]): Map<string, ModelLoadResult> {
  return new Map(results.map((result) => [result.path, result]))
}

export default function ViewerCanvas({ source, equipped, raceCode }: ViewerCanvasProps) {
  const container = useRef<HTMLDivElement>(null)
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
    const equipmentPlans = selected.map(([slot, item]) => ({ slot, item, candidates: equipmentModelCandidates(item, raceCode) }))
    const characterPlans = allCharacterPlans.filter((plan) => !plan.coveredBy || !equipped[plan.coveredBy])
    setError(undefined)
    setStatus(`Reading ${raceCode} character models…`)

    void (async () => {
      const failures: string[] = []
      let characterParts = 0
      let equippedItems = 0
      if (source.kind === 'local') {
        const paths = [...new Set([
          ...characterPlans.map((plan) => plan.path),
          ...equipmentPlans.flatMap((plan) => plan.candidates),
        ])]
        const byPath = resultMap(await loadLocalModels(source, paths))
        if (disposed) return

        for (const plan of characterPlans) {
          const result = byPath.get(plan.path)
          if (result?.model) {
            addDecodedModel(characterGroup, result.model, PART_COLORS[plan.part], `character-${plan.part}`)
            characterParts += 1
          } else {
            failures.push(`${plan.part}: ${result?.error || 'model not found'}`)
          }
        }
        for (const plan of equipmentPlans) {
          const result = plan.candidates.map((path) => byPath.get(path)).find((candidate) => candidate?.model)
          if (result?.model) {
            addDecodedModel(characterGroup, result.model, SLOT_COLORS[plan.slot], `equipment-${plan.slot}`)
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
        ? `${raceCode} bind-pose character · ${equippedItems}/${selected.length} equipped · drag to rotate`
        : 'Character models could not be decoded')
      if (failures.length) setError(failures.join('\n'))
    })().catch((reason) => {
      if (disposed) return
      setStatus('Character models could not be decoded')
      setError(reason instanceof Error ? reason.message : 'Unknown character decode error')
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
        materials.forEach((item) => item.dispose())
      })
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [source, equipped, raceCode])

  return (
    <div className="viewer-canvas-wrap">
      <div className="viewer-canvas" ref={container} aria-label="Three-dimensional FFXIV character and armor inspection view" />
      <p className="viewer-status" aria-live="polite">{status}</p>
      {error && <details className="viewer-error"><summary>Some character assets did not load</summary><pre>{error}</pre></details>}
    </div>
  )
}
