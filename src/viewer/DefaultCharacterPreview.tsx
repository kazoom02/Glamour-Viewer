import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

// A fanbyte-style in-browser model viewer, on modern three.js. It ships with a
// default FFXIV character (bundled GLB) and its idle motion, then lets the user
// drop in their own exported model GLB and any number of motion GLBs. Motions are
// retargeted onto the character purely by bone name — the shared FFXIV skeleton
// naming means an exported emote just plays on any character with the same rig.
const MODEL_URL = `${import.meta.env.BASE_URL}KigyFigy.glb`
const IDLE_URL = `${import.meta.env.BASE_URL}KigyFigy_idle.glb`

type ViewerController = {
  loadModel: (data: ArrayBuffer, label: string) => Promise<void>
  addMotion: (data: ArrayBuffer, label: string) => Promise<void>
  playClip: (name: string) => void
  togglePause: () => boolean
  resetView: () => void
}

type LoadState = 'loading' | 'ready' | 'error'

const stripExtension = (name: string) => name.replace(/\.[^.]+$/, '')

export default function DefaultCharacterPreview() {
  const container = useRef<HTMLDivElement>(null)
  const controller = useRef<ViewerController | null>(null)
  const modelInput = useRef<HTMLInputElement>(null)
  const motionInput = useRef<HTMLInputElement>(null)

  const [state, setState] = useState<LoadState>('loading')
  const [clips, setClips] = useState<string[]>([])
  const [activeClip, setActiveClip] = useState('')
  const [paused, setPaused] = useState(false)
  const [modelLabel, setModelLabel] = useState('KigyFigy')
  const [notice, setNotice] = useState('')

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

    // Studio rig copied from ViewerCanvas so this matches the live gear view.
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

    // Mutable scene state driven by the React controls below.
    let character: THREE.Object3D | null = null
    let mixer: THREE.AnimationMixer | undefined
    const clipMap = new Map<string, THREE.AnimationClip>()
    const actionMap = new Map<string, THREE.AnimationAction>()
    let currentName = ''
    let isPaused = false
    const clock = new THREE.Clock()

    const disposeObject = (object: THREE.Object3D) => {
      object.traverse((node) => {
        if (!(node instanceof THREE.Mesh)) return
        node.geometry.dispose()
        const materials = Array.isArray(node.material) ? node.material : [node.material]
        materials.forEach((material) => material.dispose())
      })
    }

    // No textures come out of the exporter, so present every model as a clean
    // matte "clay" render — warm for skin, cool neutral for gear.
    const clayify = (object: THREE.Object3D) => {
      object.traverse((node) => {
        if (!(node instanceof THREE.Mesh)) return
        const name = (Array.isArray(node.material) ? node.material[0]?.name : node.material?.name) ?? ''
        node.frustumCulled = false
        node.material = new THREE.MeshStandardMaterial({
          color: /skin/i.test(name) ? 0xd8c3b0 : 0xc6cad2,
          metalness: 0.0,
          roughness: 0.72,
        })
      })
    }

    const frameCharacter = () => {
      if (!character) return
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
    }

    const rebuildActions = () => {
      actionMap.clear()
      if (!mixer) return
      for (const [name, clip] of clipMap) {
        const action = mixer.clipAction(clip)
        action.setLoop(THREE.LoopRepeat, Infinity)
        actionMap.set(name, action)
      }
    }

    const play = (name: string) => {
      const action = actionMap.get(name)
      if (!action || !mixer) return
      const previous = currentName ? actionMap.get(currentName) : undefined
      action.enabled = true
      action.setEffectiveWeight(1)
      action.paused = false
      action.play()
      if (previous && previous !== action) previous.crossFadeTo(action, 0.3, false)
      currentName = name
      isPaused = false
      if (!disposed) {
        setActiveClip(name)
        setPaused(false)
      }
    }

    const setCharacter = (root: THREE.Object3D) => {
      if (character) {
        scene.remove(character)
        disposeObject(character)
      }
      mixer?.stopAllAction()
      character = root
      clayify(character)
      scene.add(character)
      frameCharacter()
      mixer = new THREE.AnimationMixer(character)
      rebuildActions()
      // Resume whatever animation was selected (or the first available).
      const resume = currentName && clipMap.has(currentName) ? currentName : clipMap.keys().next().value
      if (resume) play(resume)
    }

    const addClip = (name: string, clip: THREE.AnimationClip) => {
      // Drop translation tracks so exported emotes don’t stretch limbs.
      // We keep n_root translations if present so locomotion works.
      clip.tracks = clip.tracks.filter((track) => {
        if (!track.name.endsWith('.position')) return true
        const boneName = track.name.split('.')[0]!
        return boneName === 'n_root' || boneName.startsWith('j_buki_') || boneName.startsWith('n_buki_') || boneName.startsWith('ik_') || boneName.startsWith('iv_')
      })
      let unique = name
      let n = 2
      while (clipMap.has(unique)) unique = `${name} ${n++}`
      clip.name = unique
      clipMap.set(unique, clip)
      if (mixer) {
        const action = mixer.clipAction(clip)
        action.setLoop(THREE.LoopRepeat, Infinity)
        actionMap.set(unique, action)
      }
      if (!disposed) setClips(Array.from(clipMap.keys()))
      return unique
    }

    let loaderPromise: Promise<typeof import('three/examples/jsm/loaders/GLTFLoader.js')['GLTFLoader']> | null = null
    const getLoaderClass = () => {
      if (!loaderPromise) {
        loaderPromise = import('three/examples/jsm/loaders/GLTFLoader.js').then((m) => m.GLTFLoader)
      }
      return loaderPromise
    }
    const parseGlb = async (data: ArrayBuffer) => {
      const GLTFLoader = await getLoaderClass()
      const loader = new GLTFLoader()
      return await new Promise<import('three/examples/jsm/loaders/GLTFLoader.js').GLTF>((resolve, reject) => {
        loader.parse(data, '', resolve, reject)
      })
    }

    controller.current = {
      loadModel: async (data, label) => {
        const gltf = await parseGlb(data)
        if (disposed) return
        setCharacter(gltf.scene)
        if (!disposed) setModelLabel(label)
      },
      addMotion: async (data, label) => {
        const gltf = await parseGlb(data)
        if (disposed) return
        const clip = gltf.animations[0]
        if (!clip) throw new Error('That GLB has no animation track.')
        const name = addClip(label, clip)
        play(name)
      },
      playClip: (name) => play(name),
      togglePause: () => {
        isPaused = !isPaused
        const action = currentName ? actionMap.get(currentName) : undefined
        if (action) action.paused = isPaused
        if (!disposed) setPaused(isPaused)
        return isPaused
      },
      resetView: () => frameCharacter(),
    }

    const render = () => {
      const delta = Math.min(clock.getDelta(), 0.1)
      if (!isPaused) mixer?.update(delta)
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

    // Load the bundled default character + idle motion.
    void (async () => {
      try {
        const [modelRes, idleRes] = await Promise.all([fetch(MODEL_URL), fetch(IDLE_URL)])
        if (!modelRes.ok || !idleRes.ok) throw new Error('Bundled model failed to download.')
        const [modelBuf, idleBuf] = await Promise.all([modelRes.arrayBuffer(), idleRes.arrayBuffer()])
        if (disposed) return
        // Avoid crashing on empty GLBs (e.g. Git LFS issues)
        const fetchCheck = await Promise.all([fetch(MODEL_URL, {method: 'HEAD'}), fetch(IDLE_URL, {method: 'HEAD'})])
        if (Number(fetchCheck[0].headers.get('content-length')) < 1000) {
          throw new Error('Default character GLB is missing or empty.')
        }
        const [modelGltf, idleGltf] = await Promise.all([parseGlb(modelBuf), parseGlb(idleBuf)])
        if (disposed) return
        if (idleGltf.animations[0]) addClip('Idle', idleGltf.animations[0])
        setCharacter(modelGltf.scene)
        setState('ready')
      } catch (reason) {
        if (disposed) return
        console.error('Model viewer failed to initialise', reason)
        setState('error')
      }
    })()

    render()

    return () => {
      disposed = true
      controller.current = null
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

  const onModelFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !controller.current) return
    setNotice(`Loading ${file.name}…`)
    try {
      await controller.current.loadModel(await file.arrayBuffer(), stripExtension(file.name))
      setNotice('')
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : 'Could not load that model.')
    }
  }

  const onMotionFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !controller.current) return
    setNotice(`Loading ${file.name}…`)
    try {
      await controller.current.addMotion(await file.arrayBuffer(), stripExtension(file.name))
      setNotice('')
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : 'Could not load that motion.')
    }
  }

  return (
    <div className="viewer-canvas-wrap">
      <div className="viewer-canvas" ref={container} aria-label="FFXIV model and animation viewer" />

      {state !== 'ready' && (
        <div className="viewer-loading default-preview-overlay">
          {state === 'error' ? 'Model viewer unavailable' : 'Loading model viewer…'}
        </div>
      )}

      {state === 'ready' && (
        <>
          <div className="mv-toolbar mv-toolbar-top" role="group" aria-label="Model controls">
            <span className="mv-model-name" title="Current model">{modelLabel}</span>
            <button type="button" onClick={() => modelInput.current?.click()}>Load model…</button>
            <button type="button" onClick={() => motionInput.current?.click()}>Add motion…</button>
          </div>

          <div className="mv-toolbar mv-toolbar-bottom" role="group" aria-label="Animation controls">
            <div className="mv-anim-list" role="tablist" aria-label="Animations">
              {clips.map((name) => (
                <button
                  key={name}
                  type="button"
                  role="tab"
                  aria-selected={name === activeClip}
                  className={name === activeClip ? 'active' : ''}
                  onClick={() => controller.current?.playClip(name)}
                >
                  {name}
                </button>
              ))}
            </div>
            <div className="mv-transport">
              <button
                type="button"
                onClick={() => controller.current?.togglePause()}
                disabled={!activeClip}
                title={paused ? 'Play' : 'Pause'}
              >
                {paused ? '► Play' : '❚❚ Pause'}
              </button>
              <button type="button" onClick={() => controller.current?.resetView()} title="Recenter camera">
                Reset view
              </button>
            </div>
          </div>

          {notice && <p className="mv-notice" role="status">{notice}</p>}
        </>
      )}

      <input ref={modelInput} type="file" accept=".glb,model/gltf-binary" hidden onChange={onModelFile} />
      <input ref={motionInput} type="file" accept=".glb,model/gltf-binary" hidden onChange={onMotionFile} />
    </div>
  )
}
