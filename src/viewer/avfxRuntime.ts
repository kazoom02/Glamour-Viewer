import * as THREE from 'three'
import type {
  AvfxColorCurve,
  AvfxEmitterDefinition,
  AvfxModelGeometry,
  AvfxParticleDefinition,
  AvfxSpawnRule,
  AvfxVectorCurve,
  DecodedAvfx,
} from '../asset-source/avfx'
import { evaluateAvfxCurve } from '../asset-source/avfx'
import type { DecodedTexture } from '../asset-source/tex'

interface RuntimeEmitter {
  definition: number
  age: number
  origin: THREE.Vector3
  position: THREE.Vector3
  rotation: THREE.Euler
  scale: THREE.Vector3
  nextParticle: number[]
  nextEmitter: number[]
  seed: number
}

interface RuntimeParticle {
  definition: AvfxParticleDefinition
  object: THREE.Object3D
  material: THREE.MeshBasicMaterial | THREE.SpriteMaterial
  age: number
  life: number
  position: THREE.Vector3
  velocity: THREE.Vector3
  rotation: THREE.Euler
  inheritedScale: THREE.Vector3
  seed: number
}

export interface AvfxRuntime {
  readonly renderedParticles: number
  readonly decodedEmitters: number
  readonly decodedModels: number
  update(deltaSeconds: number): void
  dispose(): void
}

const MAX_PARTICLES = 384

function seeded(seed: number): number {
  let value = seed | 0
  value ^= value << 13
  value ^= value >>> 17
  value ^= value << 5
  return (value >>> 0) / 0xffffffff
}

function randomSigned(seed: number): number {
  return seeded(seed) * 2 - 1
}

function curveRandom(curve: Parameters<typeof evaluateAvfxCurve>[0], frame: number, seed: number): number {
  if (!curve) return 0
  const magnitude = evaluateAvfxCurve(curve, frame)
  switch (curve.randomType) {
    case 1:
    case 4: return magnitude * seeded(seed)
    case 2:
    case 5: return -magnitude * seeded(seed)
    default: return magnitude * randomSigned(seed)
  }
}

function vectorAt(curve: AvfxVectorCurve, frame: number, fallback: number, seed: number): THREE.Vector3 {
  return new THREE.Vector3(
    evaluateAvfxCurve(curve.x, frame, fallback) + curveRandom(curve.randomX, frame, seed + 11),
    evaluateAvfxCurve(curve.y, frame, fallback) + curveRandom(curve.randomY, frame, seed + 23),
    evaluateAvfxCurve(curve.z, frame, fallback) + curveRandom(curve.randomZ, frame, seed + 37),
  )
}

function colorAt(curve: AvfxColorCurve, frame: number): THREE.Color {
  const keys = curve.rgb
  if (!keys?.length) return new THREE.Color(1, 1, 1)
  if (frame <= keys[0]!.frame) return new THREE.Color(keys[0]!.r, keys[0]!.g, keys[0]!.b)
  const last = keys.at(-1)!
  if (frame >= last.frame) return new THREE.Color(last.r, last.g, last.b)
  for (let index = 0; index + 1 < keys.length; index++) {
    const left = keys[index]!
    const right = keys[index + 1]!
    if (frame > right.frame) continue
    const amount = (frame - left.frame) / Math.max(right.frame - left.frame, 1)
    return new THREE.Color(
      THREE.MathUtils.lerp(left.r, right.r, amount),
      THREE.MathUtils.lerp(left.g, right.g, amount),
      THREE.MathUtils.lerp(left.b, right.b, amount),
    )
  }
  return new THREE.Color(last.r, last.g, last.b)
}

function wrapping(value: number): THREE.Wrapping {
  return value === 0 ? THREE.RepeatWrapping : value === 2 ? THREE.MirroredRepeatWrapping : THREE.ClampToEdgeWrapping
}

function decodedTexture(source: DecodedTexture, anisotropy: number, colorToAlpha = false): THREE.DataTexture {
  const rgba = colorToAlpha ? new Uint8Array(source.rgba) : source.rgba
  if (colorToAlpha) {
    for (let offset = 0; offset < rgba.length; offset += 4) {
      rgba[offset + 3] = Math.max(rgba[offset]!, rgba[offset + 1]!, rgba[offset + 2]!)
    }
  }
  const map = new THREE.DataTexture(rgba, source.width, source.height, THREE.RGBAFormat, THREE.UnsignedByteType)
  map.colorSpace = THREE.SRGBColorSpace
  map.minFilter = THREE.LinearMipmapLinearFilter
  map.magFilter = THREE.LinearFilter
  map.generateMipmaps = true
  map.anisotropy = anisotropy
  map.flipY = false
  map.needsUpdate = true
  return map
}

function blending(drawMode: number): THREE.Blending {
  if (drawMode === 1 || drawMode === 9) return THREE.MultiplyBlending
  if (drawMode === 2 || drawMode === 4 || drawMode === 10 || drawMode === 12) return THREE.AdditiveBlending
  if (drawMode === 3 || drawMode === 11) return THREE.SubtractiveBlending
  return THREE.NormalBlending
}

function modelGeometry(source: AvfxModelGeometry): THREE.BufferGeometry | undefined {
  if (!source.positions.length || !source.indices.length) return undefined
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(source.positions, 3))
  if (source.normals.length) geometry.setAttribute('normal', new THREE.BufferAttribute(source.normals, 3))
  if (source.colors.length) geometry.setAttribute('color', new THREE.BufferAttribute(source.colors, 4, true))
  if (source.uvs.length) geometry.setAttribute('uv', new THREE.BufferAttribute(source.uvs, 2))
  geometry.setIndex(new THREE.BufferAttribute(source.indices, 1))
  geometry.computeBoundingSphere()
  return geometry
}

function discGeometry(definition: AvfxParticleDefinition): THREE.BufferGeometry {
  const segmentsValue = definition.data.PCnV
  const segments = Math.max(12, Math.min(128, typeof segmentsValue === 'number' ? Math.round(segmentsValue) : 32))
  const geometry = new THREE.RingGeometry(0.72, 1, segments, 1)
  geometry.rotateX(-Math.PI / 2)
  return geometry
}

function spriteGeometry(): THREE.PlaneGeometry {
  return new THREE.PlaneGeometry(1, 1)
}

function firstTextureIndex(definition: AvfxParticleDefinition): number | undefined {
  for (const binding of definition.colorTextures) {
    if (binding.enabled && binding.textureIndices.length) return binding.textureIndices[0]
  }
  return undefined
}

function emitterFrame(definition: AvfxEmitterDefinition, age: number): number {
  if (definition.loopEnd > definition.loopStart && age > definition.loopEnd) {
    return definition.loopStart + (age - definition.loopStart) % (definition.loopEnd - definition.loopStart)
  }
  return age
}

/** Browser-side AVFX graph runner. It never persists or uploads source assets. */
export function createAvfxRuntime(
  target: THREE.Object3D,
  avfx: DecodedAvfx,
  decodedTextures: Array<{ path: string; texture: DecodedTexture }>,
  anisotropy: number,
): AvfxRuntime {
  const group = new THREE.Group()
  group.name = 'equipment-avfx-runtime'
  target.add(group)
  const textureSources = new Map(decodedTextures.map((entry) => [entry.path.toLowerCase(), entry.texture]))
  const textureCache = new Map<number, THREE.Texture>()
  const geometryCache = avfx.models.map(modelGeometry)
  const proceduralGeometryCache = new Map<number, THREE.BufferGeometry>()
  const emitters: RuntimeEmitter[] = []
  const particles: RuntimeParticle[] = []
  let seed = 0x4f6d6567
  let globalFrame = 0
  const startedTimelineItems = new Set<number>()
  const mainTimeline = avfx.timelines.find((timeline) => timeline.items.some((item) => item.emitter >= 0))
  const loopEnd = mainTimeline?.loopEnd && mainTimeline.loopEnd > 0 ? mainTimeline.loopEnd : 0

  const textureFor = (definition: AvfxParticleDefinition, definitionIndex: number): THREE.Texture | undefined => {
    const cached = textureCache.get(definitionIndex)
    if (cached) return cached
    const index = firstTextureIndex(definition)
    if (index === undefined) return undefined
    const path = avfx.textures[index]
    const source = path ? textureSources.get(path) : undefined
    if (!source) return undefined
    const binding = definition.colorTextures.find((candidate) => candidate.enabled && candidate.textureIndices.includes(index))
    const map = decodedTexture(source, anisotropy, binding?.colorToAlpha)
    map.wrapS = wrapping(binding?.borderU ?? 1)
    map.wrapT = wrapping(binding?.borderV ?? 1)
    map.magFilter = binding?.filter === 0 ? THREE.NearestFilter : THREE.LinearFilter
    textureCache.set(definitionIndex, map)
    return map
  }

  const sampleEmitterPoint = (definition: AvfxEmitterDefinition, instanceSeed: number): THREE.Vector3 => {
    const modelIndex = definition.modelIndices[Math.floor(seeded(instanceSeed) * Math.max(definition.modelIndices.length, 1))]
    const model = modelIndex === undefined ? undefined : avfx.models[modelIndex]
    const positions = model?.emitPositions.length ? model.emitPositions : model?.positions
    if (!positions?.length) return new THREE.Vector3()
    const count = positions.length / 3
    const point = definition.generateMethod === 1 || definition.generateMethod === 3
      ? instanceSeed % count
      : Math.floor(seeded(instanceSeed + 41) * count)
    return new THREE.Vector3(positions[point * 3], positions[point * 3 + 1], positions[point * 3 + 2])
  }

  const addEmitter = (definition: number, position = new THREE.Vector3(), parentSeed = seed++) => {
    const source = avfx.emitters[definition]
    if (!source) return
    emitters.push({
      definition,
      age: 0,
      origin: position.clone(),
      position: position.clone(),
      rotation: new THREE.Euler(),
      scale: new THREE.Vector3(1, 1, 1),
      nextParticle: source.particleRules.map((rule) => rule.createTime),
      nextEmitter: source.emitterRules.map((rule) => rule.createTime),
      seed: parentSeed,
    })
  }

  const materialFor = (definition: AvfxParticleDefinition, map: THREE.Texture | undefined): THREE.MeshBasicMaterial | THREE.SpriteMaterial => {
    const common = {
      ...(map ? { map } : {}),
      color: 0xffffff,
      transparent: true,
      opacity: 1,
      blending: blending(definition.drawMode),
      depthTest: definition.depthTest,
      depthWrite: definition.depthWrite,
      toneMapped: false,
    }
    return definition.type === 1
      ? new THREE.SpriteMaterial(common)
      : new THREE.MeshBasicMaterial({ ...common, vertexColors: definition.type === 5 || definition.type === 13, side: THREE.DoubleSide })
  }

  const addParticle = (rule: AvfxSpawnRule, parent: RuntimeEmitter) => {
    const definition = avfx.particles[rule.target]
    if (!definition || particles.length >= MAX_PARTICLES) return
    const instanceSeed = seed++
    if (seeded(instanceSeed + 101) * 100 > rule.probability) return
    const modelIndex = definition.modelIndices[Math.floor(seeded(instanceSeed + 7) * Math.max(definition.modelIndices.length, 1))]
    const authoredGeometry = modelIndex === undefined ? undefined : geometryCache[modelIndex]
    const map = textureFor(definition, rule.target)
    const material = materialFor(definition, map)
    let proceduralGeometry = proceduralGeometryCache.get(rule.target)
    if (!authoredGeometry && definition.type !== 1 && !proceduralGeometry) {
      proceduralGeometry = definition.type === 12 ? discGeometry(definition) : spriteGeometry()
      proceduralGeometryCache.set(rule.target, proceduralGeometry)
    }
    const object: THREE.Object3D = definition.type === 1
      ? new THREE.Sprite(material as THREE.SpriteMaterial)
      : new THREE.Mesh(authoredGeometry ?? proceduralGeometry!, material as THREE.MeshBasicMaterial)
    object.name = `avfx-particle-${rule.target}`
    object.renderOrder = 20 + definition.drawPriority
    const local = parent.definition >= 0 && avfx.emitters[parent.definition]?.type === 5
      ? sampleEmitterPoint(avfx.emitters[parent.definition]!, instanceSeed)
      : new THREE.Vector3()
    local.multiply(parent.scale).applyEuler(parent.rotation)
    const position = rule.positionInfluence ? parent.position.clone().add(local) : local
    object.position.copy(position)
    group.add(object)
    const randomLife = definition.lifeRandom ? randomSigned(instanceSeed + 67) * definition.lifeRandom : 0
    particles.push({
      definition,
      object,
      material,
      age: rule.startFrame,
      life: rule.overrideLife ?? Math.max(1, definition.life + randomLife),
      position,
      velocity: new THREE.Vector3(),
      rotation: rule.rotationInfluence ? parent.rotation.clone() : new THREE.Euler(),
      inheritedScale: rule.scaleInfluence ? parent.scale.clone() : new THREE.Vector3(1, 1, 1),
      seed: instanceSeed,
    })
  }

  const triggerRule = (rule: AvfxSpawnRule, parent: RuntimeEmitter, emitterRule: boolean) => {
    const countCurve = avfx.emitters[parent.definition]?.createCount
    const count = Math.max(1, Math.round(evaluateAvfxCurve(countCurve, parent.age, 1))) * Math.max(1, rule.createCount)
    for (let index = 0; index < count; index++) {
      if (emitterRule) {
        const source = avfx.emitters[parent.definition]
        const local = source?.type === 5 ? sampleEmitterPoint(source, seed + index) : new THREE.Vector3()
        local.multiply(parent.scale).applyEuler(parent.rotation)
        addEmitter(rule.target, parent.position.clone().add(local), seed + index)
      } else addParticle(rule, parent)
    }
  }

  const resetGraph = () => {
    for (const particle of particles.splice(0)) {
      group.remove(particle.object)
      particle.material.dispose()
    }
    emitters.length = 0
    startedTimelineItems.clear()
    avfx.rootEmitterIndices.forEach((index) => addEmitter(index))
    mainTimeline?.items.forEach((item, index) => {
      if (item.enabled && item.startFrame === 0 && item.emitter >= 0) startedTimelineItems.add(index)
    })
  }

  resetGraph()

  return {
    get renderedParticles() { return particles.length },
    get decodedEmitters() { return avfx.emitters.length },
    get decodedModels() { return avfx.models.length },
    update(deltaSeconds: number) {
      const deltaFrames = Math.min(deltaSeconds, 0.1) * avfx.framesPerSecond
      const previousGlobalFrame = globalFrame
      globalFrame += deltaFrames
      if (loopEnd > 0 && globalFrame >= loopEnd) {
        globalFrame %= loopEnd
        resetGraph()
      }
      mainTimeline?.items.forEach((item, index) => {
        if (!item.enabled || item.emitter < 0 || startedTimelineItems.has(index)) return
        const crossedStart = globalFrame >= item.startFrame && (previousGlobalFrame < item.startFrame || previousGlobalFrame > globalFrame)
        if (crossedStart) {
          addEmitter(item.emitter)
          startedTimelineItems.add(index)
        }
      })
      for (let emitterIndex = emitters.length - 1; emitterIndex >= 0; emitterIndex--) {
        const emitter = emitters[emitterIndex]!
        const definition = avfx.emitters[emitter.definition]!
        emitter.age += deltaFrames
        const frame = emitterFrame(definition, emitter.age)
        emitter.position.copy(emitter.origin).add(vectorAt(definition.position, frame, 0, emitter.seed))
        emitter.rotation.setFromVector3(vectorAt(definition.rotation, frame, 0, emitter.seed))
        emitter.scale.copy(vectorAt(definition.scale, frame, 1, emitter.seed))
        const interval = Math.max(1, evaluateAvfxCurve(definition.createInterval, frame, 1))
        definition.particleRules.forEach((rule, index) => {
          if (!rule.enabled) return
          while (frame >= emitter.nextParticle[index]! && emitter.nextParticle[index]! <= definition.life) {
            triggerRule(rule, emitter, false)
            emitter.nextParticle[index]! += interval
          }
        })
        definition.emitterRules.forEach((rule, index) => {
          if (!rule.enabled) return
          while (frame >= emitter.nextEmitter[index]! && emitter.nextEmitter[index]! <= definition.life) {
            triggerRule(rule, emitter, true)
            emitter.nextEmitter[index]! += interval
          }
        })
        if (emitter.age > definition.life) emitters.splice(emitterIndex, 1)
      }
      for (let index = particles.length - 1; index >= 0; index--) {
        const particle = particles[index]!
        particle.age += deltaFrames
        if (particle.age >= particle.life) {
          group.remove(particle.object)
          particle.material.dispose()
          particles.splice(index, 1)
          continue
        }
        const frame = particle.definition.loopEnd > particle.definition.loopStart && particle.age > particle.definition.loopEnd
          ? particle.definition.loopStart + (particle.age - particle.definition.loopStart) % (particle.definition.loopEnd - particle.definition.loopStart)
          : particle.age
        const gravity = evaluateAvfxCurve(particle.definition.gravity, frame)
        const resistance = Math.max(0, evaluateAvfxCurve(particle.definition.airResistance, frame, 1))
        particle.velocity.y -= gravity * deltaFrames / avfx.framesPerSecond
        particle.velocity.multiplyScalar(Math.min(1, resistance ** (deltaFrames / avfx.framesPerSecond)))
        const authoredPosition = vectorAt(particle.definition.position, frame, 0, particle.seed)
        particle.object.position.copy(particle.position).add(authoredPosition).addScaledVector(particle.velocity, particle.age / avfx.framesPerSecond)
        const rotation = vectorAt(particle.definition.rotation, frame, 0, particle.seed)
        const rotationVelocity = vectorAt(particle.definition.rotationVelocity, frame, 0, particle.seed + 83)
        particle.object.rotation.set(
          particle.rotation.x + rotation.x + rotationVelocity.x * frame,
          particle.rotation.y + rotation.y + rotationVelocity.y * frame,
          particle.rotation.z + rotation.z + rotationVelocity.z * frame,
        )
        particle.object.scale.copy(vectorAt(particle.definition.scale, frame, 1, particle.seed)).multiply(particle.inheritedScale)
        const color = colorAt(particle.definition.color, frame)
        const brightness = evaluateAvfxCurve(particle.definition.color.brightness, frame, 1)
        particle.material.color.copy(color).multiplyScalar(brightness)
        particle.material.opacity = THREE.MathUtils.clamp(
          evaluateAvfxCurve(particle.definition.color.alpha, frame, 1) * evaluateAvfxCurve(particle.definition.color.scaleAlpha, frame, 1),
          0,
          1,
        )
        const binding = particle.definition.colorTextures.find((candidate) => candidate.enabled && candidate.textureIndices.length)
        const uv = particle.definition.uvSets[binding?.uvSet ?? 0]
        const map = particle.material.map
        if (map && uv) {
          const scale = vectorAt(uv.scale, frame, 1, particle.seed)
          const scroll = vectorAt(uv.scroll, frame, 0, particle.seed)
          map.repeat.set(scale.x, scale.y)
          map.offset.set(scroll.x, scroll.y)
          map.rotation = evaluateAvfxCurve(uv.rotation, frame)
        }
      }
    },
    dispose() {
      resetGraph()
      textureCache.forEach((texture) => texture.dispose())
      textureCache.clear()
      for (const geometry of geometryCache) geometry?.dispose()
      proceduralGeometryCache.forEach((geometry) => geometry.dispose())
      proceduralGeometryCache.clear()
      target.remove(group)
    },
  }
}
