import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { AssetSource } from '../asset-source/types'
import { equipmentAssetPlan } from '../asset-source/equipmentPlan'
import { loadLocalEquipmentModel } from '../asset-source/modelLoader'
import type { DecodedModel } from '../asset-source/mdl'
import type { ArmorSlot, EquippedArmor } from '../catalog/types'

interface ViewerCanvasProps {
  source: AssetSource
  equipped: EquippedArmor
}

const SLOT_COLORS: Record<ArmorSlot, number> = {
  head: 0xd5b36f,
  body: 0xa6804f,
  hands: 0x8f7557,
  legs: 0x7a6651,
  feet: 0x63584b,
}

function addMannequin(scene: THREE.Scene): THREE.Group {
  const group = new THREE.Group()
  group.name = 'inspection-mannequin'
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: 0x5d6065,
    roughness: 0.88,
    metalness: 0,
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
  })
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.8, 6, 18), bodyMaterial)
  body.position.y = 1.05
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 20, 16), bodyMaterial)
  head.position.y = 1.75
  const hips = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.3, 5, 14), bodyMaterial)
  hips.position.y = 0.55
  const limbGeometry = new THREE.CapsuleGeometry(0.075, 0.65, 5, 12)
  const leftArm = new THREE.Mesh(limbGeometry, bodyMaterial)
  leftArm.rotation.z = -0.1
  leftArm.position.set(-0.37, 1.05, 0)
  const rightArm = new THREE.Mesh(limbGeometry, bodyMaterial)
  rightArm.rotation.z = 0.1
  rightArm.position.set(0.37, 1.05, 0)
  const leftLeg = new THREE.Mesh(limbGeometry, bodyMaterial)
  leftLeg.position.set(-0.13, 0.06, 0)
  const rightLeg = new THREE.Mesh(limbGeometry, bodyMaterial)
  rightLeg.position.set(0.13, 0.06, 0)
  group.add(body, head, hips, leftArm, rightArm, leftLeg, rightLeg)
  scene.add(group)
  return group
}

function addDecodedModel(target: THREE.Group, model: DecodedModel, slot: ArmorSlot): number {
  const material = new THREE.MeshStandardMaterial({
    color: SLOT_COLORS[slot],
    roughness: 0.62,
    metalness: 0.16,
    side: THREE.DoubleSide,
  })
  for (const part of model.meshes) {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(part.positions, 3))
    if (part.normals) geometry.setAttribute('normal', new THREE.BufferAttribute(part.normals, 3))
    else geometry.computeVertexNormals()
    if (part.uvs) geometry.setAttribute('uv', new THREE.BufferAttribute(part.uvs, 2))
    geometry.setIndex(new THREE.BufferAttribute(part.indices, 1))
    geometry.computeBoundingBox()
    geometry.computeBoundingSphere()
    target.add(new THREE.Mesh(geometry, material))
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

export default function ViewerCanvas({ source, equipped }: ViewerCanvasProps) {
  const container = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState('Choose an armor piece below')
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
    const mannequin = addMannequin(scene)
    const equipmentGroup = new THREE.Group()
    equipmentGroup.name = 'equipped-armor'
    scene.add(equipmentGroup)

    scene.add(new THREE.HemisphereLight(0xf4e8d5, 0x171a22, 2.3))
    const key = new THREE.DirectionalLight(0xffd9a0, 3.8)
    key.position.set(3, 5, 4)
    scene.add(key)
    const rim = new THREE.DirectionalLight(0x8db6ff, 1.6)
    rim.position.set(-4, 2, -3)
    scene.add(rim)

    const selected = Object.entries(equipped) as Array<[ArmorSlot, EquippedArmor[ArmorSlot]]>
    const items = selected.filter((entry): entry is [ArmorSlot, NonNullable<EquippedArmor[ArmorSlot]>] => Boolean(entry[1]))
    setError(undefined)
    setStatus(items.length ? `Reading ${items.length} armor ${items.length === 1 ? 'piece' : 'pieces'}…` : 'Choose an armor piece below')

    void (async () => {
      let loadedParts = 0
      const failures: string[] = []
      for (const [slot, item] of items) {
        if (disposed) return
        const plan = equipmentAssetPlan(item)
        setStatus(`Loading ${item.name}…`)
        try {
          if (source.kind === 'local') {
            const model = await loadLocalEquipmentModel(source, plan.modelPath)
            if (disposed) return
            loadedParts += addDecodedModel(equipmentGroup, model, slot)
          } else {
            const remoteModel = await loadRemoteModel(source, plan.modelPath)
            if (disposed) return
            equipmentGroup.add(remoteModel)
            loadedParts += 1
          }
        } catch (reason) {
          failures.push(`${item.name}: ${reason instanceof Error ? reason.message : 'unknown decode error'}`)
        }
      }
      if (disposed) return
      if (loadedParts) {
        mannequin.visible = true
        fitCamera(camera, controls, equipmentGroup)
        setStatus(`${items.length - failures.length}/${items.length} equipped · drag to rotate · scroll to zoom`)
      } else if (items.length) {
        setStatus('Armor could not be decoded')
      }
      if (failures.length) setError(failures.join('\n'))
    })()

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
  }, [source, equipped])

  return (
    <div className="viewer-canvas-wrap">
      <div className="viewer-canvas" ref={container} aria-label="Three-dimensional armor inspection view" />
      <p className="viewer-status" aria-live="polite">{status}</p>
      {error && <details className="viewer-error"><summary>Some geometry did not load</summary><pre>{error}</pre></details>}
    </div>
  )
}
