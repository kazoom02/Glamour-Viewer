import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

// The default character and its idle motion are bundled as self-contained GLBs in
// public/. They are exported FFXIV assets (SharpGLTF/Meddle) with no textures, so
// this preview renders them as a clean matte "clay" mannequin under the same studio
// rig the live ViewerCanvas uses. The two files share the standard FFXIV skeleton
// naming, so the idle clip retargets onto the character purely by bone name.
const MODEL_URL = `${import.meta.env.BASE_URL}KigyFigy.glb`
const IDLE_URL = `${import.meta.env.BASE_URL}KigyFigy_idle.glb`

type PreviewState = 'loading' | 'ready' | 'error'

export default function DefaultCharacterPreview() {
  const container = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<PreviewState>('loading')
  const [label, setLabel] = useState('Loading preview…')

  useEffect(() => {
    const host = container.current
    if (!host) return
    let disposed = false
    let frame = 0

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
    renderer.setPixelRatio(renderPixelRatio)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.NeutralToneMapping
    renderer.toneMappingExposure = 1.05
    host.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.075
    controls.rotateSpeed = 0.7
    controls.zoomSpeed = 0.8
    controls.target.set(0, 0.95, 0)
    controls.minDistance = 0.25
    controls.maxDistance = 12

    // Studio rig copied from ViewerCanvas so the default preview matches the live view.
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

    const environmentScene = new RoomEnvironment()
    const pmrem = new THREE.PMREMGenerator(renderer)
    const environmentTexture = pmrem.fromScene(environmentScene, 0.04).texture
    scene.environment = environmentTexture
    scene.environmentIntensity = 0.8
    pmrem.dispose()
    environmentScene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      object.geometry.dispose()
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      materials.forEach((material) => material.dispose())
    })

    let mixer: THREE.AnimationMixer | undefined
    const clock = new THREE.Clock()

    const render = () => {
      const delta = Math.min(clock.getDelta(), 0.1)
      mixer?.update(delta)
      controls.update()
      renderer.render(scene, camera)
      frame = requestAnimationFrame(render)
    }

    const resize = () => {
      const { clientWidth, clientHeight } = host
      renderer.setSize(clientWidth, clientHeight, false)
      camera.aspect = clientWidth / Math.max(clientHeight, 1)
      camera.updateProjectionMatrix()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(host)
    resize()

    void (async () => {
      try {
        const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
        const loader = new GLTFLoader()
        const [model, motion] = await Promise.all([
          loader.loadAsync(MODEL_URL),
          loader.loadAsync(IDLE_URL),
        ])
        if (disposed) return

        const character = model.scene
        const materialName = (mesh: THREE.Mesh) =>
          (Array.isArray(mesh.material) ? mesh.material[0]?.name : mesh.material?.name) ?? ''
        character.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return
          // These meshes carry no textures; give skin a warm tone and gear a cool
          // neutral so the untextured export reads as a clean clay render.
          const isSkin = /skin/i.test(materialName(object))
          object.frustumCulled = false
          object.material = new THREE.MeshStandardMaterial({
            color: isSkin ? 0xd8c3b0 : 0xc6cad2,
            metalness: 0.0,
            roughness: 0.72,
          })
        })
        scene.add(character)

        // Frame the whole character regardless of its exported scale/offset.
        const box = new THREE.Box3().setFromObject(character)
        const size = new THREE.Vector3()
        const center = new THREE.Vector3()
        box.getSize(size)
        box.getCenter(center)
        const height = Math.max(size.y, 0.001)
        const distance = height * 1.9
        controls.target.copy(center)
        camera.position.set(center.x + distance * 0.12, center.y + height * 0.06, center.z + distance)
        camera.near = Math.max(distance / 100, 0.01)
        camera.far = distance * 20
        camera.updateProjectionMatrix()
        controls.minDistance = height * 0.4
        controls.maxDistance = distance * 4
        controls.update()

        const clip = motion.animations[0]
        if (clip) {
          // Track names are bone names shared with the character skeleton, so the
          // mixer binds the idle loop onto the character automatically.
          mixer = new THREE.AnimationMixer(character)
          const action = mixer.clipAction(clip)
          action.setLoop(THREE.LoopRepeat, Infinity)
          action.play()
          setLabel(`Idle · ${clip.name || 'motion'}`)
        } else {
          setLabel('Preview')
        }
        setState('ready')
      } catch (reason) {
        if (disposed) return
        console.error('Default character preview failed to load', reason)
        setState('error')
        setLabel('Preview unavailable')
      }
    })()

    render()

    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      observer.disconnect()
      controls.dispose()
      mixer?.stopAllAction()
      scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return
        object.geometry.dispose()
        const materials = Array.isArray(object.material) ? object.material : [object.material]
        materials.forEach((material) => material.dispose())
      })
      scene.environment = null
      environmentTexture.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [])

  return (
    <div className="viewer-canvas-wrap">
      <div className="viewer-canvas" ref={container} aria-label="Default FFXIV character with idle animation" />
      <p className="default-preview-label" aria-live="polite">{label}</p>
      {state === 'loading' && <div className="viewer-loading default-preview-overlay">Loading default character…</div>}
      {state === 'error' && <div className="viewer-loading default-preview-overlay">Default character preview unavailable</div>}
    </div>
  )
}
