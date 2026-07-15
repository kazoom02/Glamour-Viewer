import { useEffect, useRef } from 'react'
import * as THREE from 'three'

export default function ViewerCanvas() {
  const container = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = container.current
    if (!host) return

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100)
    camera.position.set(0, 0.1, 5.2)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    host.appendChild(renderer.domElement)

    const group = new THREE.Group()
    const material = new THREE.MeshStandardMaterial({ color: 0xc9a66b, roughness: 0.52, metalness: 0.16 })
    const trim = new THREE.MeshStandardMaterial({ color: 0x373a41, roughness: 0.35, metalness: 0.5 })
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.52, 1.45, 8, 24), material)
    const shoulders = new THREE.Mesh(new THREE.CapsuleGeometry(0.25, 1.12, 6, 18), trim)
    shoulders.rotation.z = Math.PI / 2
    shoulders.position.y = 0.63
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 24, 20), material)
    head.position.y = 1.48
    group.add(body, shoulders, head)
    scene.add(group)

    scene.add(new THREE.HemisphereLight(0xf4e8d5, 0x171a22, 2.4))
    const key = new THREE.DirectionalLight(0xffd9a0, 3.6)
    key.position.set(3, 4, 4)
    scene.add(key)

    let frame = 0
    const clock = new THREE.Clock()
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
      group.rotation.y = Math.sin(clock.getElapsedTime() * 0.45) * 0.28
      renderer.render(scene, camera)
      frame = requestAnimationFrame(render)
    }
    render()

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose()
          const materials = Array.isArray(object.material) ? object.material : [object.material]
          materials.forEach((item) => item.dispose())
        }
      })
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [])

  return <div className="viewer-canvas" ref={container} aria-label="Three-dimensional outfit preview" />
}
