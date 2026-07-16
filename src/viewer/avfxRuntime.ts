import * as THREE from 'three'
import type {
  AvfxCurve,
  AvfxColorCurve,
  AvfxEmitterDefinition,
  AvfxModelGeometry,
  AvfxParticleDefinition,
  AvfxSpawnRule,
  AvfxTextureBinding,
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
  parentDefinition?: number
}

interface RuntimeParticle {
  definition: AvfxParticleDefinition
  object: THREE.Object3D
  material: THREE.ShaderMaterial
  textureLayers: AvfxTextureBinding[]
  age: number
  life: number
  position: THREE.Vector3
  velocity: THREE.Vector3
  rotation: THREE.Euler
  inheritedScale: THREE.Vector3
  seed: number
  parentDefinition: number
  trail?: TrailState
}

// A type-5 polyline particle is an authored ribbon that trails the moving spawn
// point (an in-game "beam"/"streak"). We keep the recent local positions and
// rebuild a camera-facing triangle strip through them each frame rather than
// drawing a flat, static quad.
interface TrailState {
  geometry: THREE.BufferGeometry
  position: THREE.BufferAttribute
  uv: THREE.BufferAttribute
  color: THREE.BufferAttribute
  points: THREE.Vector3[]
  capacity: number
}

export interface AvfxRuntime {
  readonly renderedParticles: number
  readonly decodedEmitters: number
  readonly decodedModels: number
  update(deltaSeconds: number, camera?: THREE.Camera): void
  /** Local-space bounds of the live particle spawn points (group frame). */
  particleBounds(): THREE.Box3
  /** Local-space bounds of the live particle geometry, including mesh extent. */
  renderedBounds(): THREE.Box3
  dispose(): void
}

const MAX_PARTICLES = 768
const TRAIL_POINTS = 24

function createRibbonGeometry(capacity: number): TrailState {
  const vertices = capacity * 2
  const geometry = new THREE.BufferGeometry()
  const position = new THREE.BufferAttribute(new Float32Array(vertices * 3), 3).setUsage(THREE.DynamicDrawUsage)
  const uv = new THREE.BufferAttribute(new Float32Array(vertices * 2), 2).setUsage(THREE.DynamicDrawUsage)
  const color = new THREE.BufferAttribute(new Float32Array(vertices * 4), 4).setUsage(THREE.DynamicDrawUsage)
  const indices = new Uint16Array((capacity - 1) * 6)
  for (let segment = 0; segment < capacity - 1; segment += 1) {
    const corner = segment * 2
    const base = segment * 6
    indices[base] = corner
    indices[base + 1] = corner + 1
    indices[base + 2] = corner + 2
    indices[base + 3] = corner + 1
    indices[base + 4] = corner + 3
    indices[base + 5] = corner + 2
  }
  geometry.setAttribute('position', position)
  geometry.setAttribute('uv', uv)
  geometry.setAttribute('avfxUv1', uv)
  geometry.setAttribute('avfxUv2', uv)
  geometry.setAttribute('avfxUv3', uv)
  geometry.setAttribute('avfxColor', color)
  geometry.setIndex(new THREE.BufferAttribute(indices, 1))
  geometry.setDrawRange(0, 0)
  return { geometry, position, uv, color, points: [], capacity }
}

const TRAIL_TANGENT = new THREE.Vector3()
const TRAIL_TO_CAMERA = new THREE.Vector3()
const TRAIL_SIDE = new THREE.Vector3()
const TRAIL_VIEW_FALLBACK = new THREE.Vector3(0, 0, 1)

/** Rebuilds a ribbon strip through the trail points, widened across the view. */
function rebuildTrail(trail: TrailState, width: number, localCamera: THREE.Vector3 | undefined): void {
  const points = trail.points
  const count = points.length
  if (count < 2) {
    trail.geometry.setDrawRange(0, 0)
    return
  }
  const position = trail.position.array as Float32Array
  const uv = trail.uv.array as Float32Array
  const color = trail.color.array as Float32Array
  const half = Math.max(width, 0.0005) / 2
  for (let index = 0; index < count; index += 1) {
    const point = points[index]!
    TRAIL_TANGENT.copy(points[Math.min(count - 1, index + 1)]!).sub(points[Math.max(0, index - 1)]!)
    if (TRAIL_TANGENT.lengthSq() < 1e-12) TRAIL_TANGENT.set(0, 1, 0)
    TRAIL_TANGENT.normalize()
    if (localCamera) TRAIL_TO_CAMERA.copy(localCamera).sub(point)
    else TRAIL_TO_CAMERA.copy(TRAIL_VIEW_FALLBACK)
    TRAIL_SIDE.crossVectors(TRAIL_TANGENT, TRAIL_TO_CAMERA)
    if (TRAIL_SIDE.lengthSq() < 1e-12) TRAIL_SIDE.crossVectors(TRAIL_TANGENT, TRAIL_VIEW_FALLBACK)
    if (TRAIL_SIDE.lengthSq() < 1e-12) TRAIL_SIDE.set(1, 0, 0)
    TRAIL_SIDE.normalize().multiplyScalar(half)
    const along = index / (count - 1)
    const left = index * 2
    const right = left + 1
    position[left * 3] = point.x + TRAIL_SIDE.x
    position[left * 3 + 1] = point.y + TRAIL_SIDE.y
    position[left * 3 + 2] = point.z + TRAIL_SIDE.z
    position[right * 3] = point.x - TRAIL_SIDE.x
    position[right * 3 + 1] = point.y - TRAIL_SIDE.y
    position[right * 3 + 2] = point.z - TRAIL_SIDE.z
    uv[left * 2] = along
    uv[left * 2 + 1] = 0
    uv[right * 2] = along
    uv[right * 2 + 1] = 1
    color[left * 4] = color[left * 4 + 1] = color[left * 4 + 2] = 1
    color[right * 4] = color[right * 4 + 1] = color[right * 4 + 2] = 1
    // Fade the older (tail) end so the beam tapers off instead of ending flat.
    color[left * 4 + 3] = along
    color[right * 4 + 3] = along
  }
  trail.position.needsUpdate = true
  trail.uv.needsUpdate = true
  trail.color.needsUpdate = true
  trail.geometry.setDrawRange(0, (count - 1) * 6)
}

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

function decodedTexture(source: DecodedTexture, anisotropy: number): THREE.DataTexture {
  const map = new THREE.DataTexture(source.rgba, source.width, source.height, THREE.RGBAFormat, THREE.UnsignedByteType)
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

function configureBlendState(material: THREE.Material, drawMode: number): void {
  if (drawMode === 4 || drawMode === 12) {
    material.blending = THREE.CustomBlending
    material.blendEquation = THREE.AddEquation
    material.blendSrc = THREE.OneFactor
    material.blendDst = THREE.OneMinusSrcColorFactor
  } else if (drawMode === 5) {
    material.blending = THREE.CustomBlending
    material.blendEquation = THREE.ReverseSubtractEquation
    material.blendSrc = THREE.SrcAlphaFactor
    material.blendDst = THREE.OneFactor
  } else if (drawMode === 6 || drawMode === 7) {
    material.blending = THREE.CustomBlending
    material.blendEquation = drawMode === 6 ? THREE.MinEquation : THREE.MaxEquation
    material.blendSrc = THREE.OneFactor
    material.blendDst = THREE.OneFactor
  }
}

function modelGeometry(source: AvfxModelGeometry): THREE.BufferGeometry | undefined {
  if (!source.positions.length || !source.indices.length) return undefined
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(source.positions, 3))
  if (source.normals.length) geometry.setAttribute('normal', new THREE.BufferAttribute(source.normals, 3))
  if (source.colors.length) geometry.setAttribute('color', new THREE.BufferAttribute(source.colors, 4, true))
  if (source.uvs.length) geometry.setAttribute('uv', new THREE.BufferAttribute(source.uvs, 2))
  if (source.uvs2.length) geometry.setAttribute('avfxUv1', new THREE.BufferAttribute(source.uvs2, 2))
  if (source.uvs3.length) geometry.setAttribute('avfxUv2', new THREE.BufferAttribute(source.uvs3, 2))
  if (source.uvs4.length) geometry.setAttribute('avfxUv3', new THREE.BufferAttribute(source.uvs4, 2))
  if (source.colors.length) geometry.setAttribute('avfxColor', new THREE.BufferAttribute(source.colors, 4, true))
  geometry.setIndex(new THREE.BufferAttribute(source.indices, 1))
  geometry.computeBoundingSphere()
  return geometry
}

function discGeometry(definition: AvfxParticleDefinition): THREE.BufferGeometry {
  const segmentsValue = definition.data.PCnV
  const segments = Math.max(12, Math.min(128, typeof segmentsValue === 'number' ? Math.round(segmentsValue) : 32))
  const dataCurve = (tag: string): AvfxCurve | undefined => {
    const value = definition.data[tag]
    return value && !Array.isArray(value) && typeof value === 'object' && 'keys' in value ? value as AvfxCurve : undefined
  }
  const radius = Math.max(
    0.001,
    Math.abs(evaluateAvfxCurve(dataCurve('RB'), 0, 1)),
    Math.abs(evaluateAvfxCurve(dataCurve('RE'), 0, 1)),
  )
  const width = Math.min(radius, Math.max(
    0.001,
    Math.abs(evaluateAvfxCurve(dataCurve('WB'), 0, radius * 0.28)),
    Math.abs(evaluateAvfxCurve(dataCurve('WE'), 0, radius * 0.28)),
  ))
  const geometry = new THREE.RingGeometry(Math.max(0, radius - width), radius, segments, 1)
  geometry.rotateX(-Math.PI / 2)
  return geometry
}

function spriteGeometry(): THREE.PlaneGeometry {
  return new THREE.PlaneGeometry(1, 1)
}

function ensureShaderAttributes(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const position = geometry.getAttribute('position')
  const uv = geometry.getAttribute('uv')
  if (!position) return geometry
  if (!uv) geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(position.count * 2), 2))
  const baseUv = geometry.getAttribute('uv')
  if (!geometry.getAttribute('avfxUv1')) geometry.setAttribute('avfxUv1', baseUv)
  if (!geometry.getAttribute('avfxUv2')) geometry.setAttribute('avfxUv2', baseUv)
  if (!geometry.getAttribute('avfxUv3')) geometry.setAttribute('avfxUv3', baseUv)
  if (!geometry.getAttribute('avfxColor')) {
    const colors = new Float32Array(position.count * 4)
    colors.fill(1)
    geometry.setAttribute('avfxColor', new THREE.BufferAttribute(colors, 4))
  }
  return geometry
}

const AVFX_VERTEX_SHADER = /* glsl */`
  attribute vec2 avfxUv1;
  attribute vec2 avfxUv2;
  attribute vec2 avfxUv3;
  attribute vec4 avfxColor;
  uniform float uBillboard;
  varying vec2 vAvfxUv0;
  varying vec2 vAvfxUv1;
  varying vec2 vAvfxUv2;
  varying vec2 vAvfxUv3;
  varying vec4 vAvfxColor;

  void main() {
    vAvfxUv0 = uv;
    vAvfxUv1 = avfxUv1;
    vAvfxUv2 = avfxUv2;
    vAvfxUv3 = avfxUv3;
    vAvfxColor = avfxColor;
    if (uBillboard > 0.5) {
      vec4 center = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      float scaleX = length(vec3(modelViewMatrix[0]));
      float scaleY = length(vec3(modelViewMatrix[1]));
      center.xy += position.xy * vec2(scaleX, scaleY);
      gl_Position = projectionMatrix * center;
    } else {
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  }
`

const AVFX_FRAGMENT_SHADER = /* glsl */`
  uniform vec3 uTint;
  uniform float uBrightness;
  uniform float uOpacity;
  varying vec2 vAvfxUv0;
  varying vec2 vAvfxUv1;
  varying vec2 vAvfxUv2;
  varying vec2 vAvfxUv3;
  varying vec4 vAvfxColor;

  uniform sampler2D uTexture0;
  uniform sampler2D uTexture1;
  uniform sampler2D uTexture2;
  uniform sampler2D uTexture3;
  uniform float uTextureEnabled0;
  uniform float uTextureEnabled1;
  uniform float uTextureEnabled2;
  uniform float uTextureEnabled3;
  uniform float uColorToAlpha0;
  uniform float uColorToAlpha1;
  uniform float uColorToAlpha2;
  uniform float uColorToAlpha3;
  uniform int uColorMode0;
  uniform int uColorMode1;
  uniform int uColorMode2;
  uniform int uColorMode3;
  uniform int uAlphaMode0;
  uniform int uAlphaMode1;
  uniform int uAlphaMode2;
  uniform int uAlphaMode3;
  uniform int uUvSet0;
  uniform int uUvSet1;
  uniform int uUvSet2;
  uniform int uUvSet3;
  uniform vec4 uUvTransform0;
  uniform vec4 uUvTransform1;
  uniform vec4 uUvTransform2;
  uniform vec4 uUvTransform3;
  uniform float uUvRotation0;
  uniform float uUvRotation1;
  uniform float uUvRotation2;
  uniform float uUvRotation3;

  vec2 uvSet(int index) {
    if (index == 1) return vAvfxUv1;
    if (index == 2) return vAvfxUv2;
    if (index == 3) return vAvfxUv3;
    return vAvfxUv0;
  }

  vec2 transformUv(vec2 source, vec4 transform, float rotation) {
    vec2 value = source * transform.xy;
    float sine = sin(rotation);
    float cosine = cos(rotation);
    value = mat2(cosine, -sine, sine, cosine) * value;
    return value + transform.zw;
  }

  vec4 prepareLayer(vec4 value, float colorToAlpha) {
    if (colorToAlpha > 0.5) value.a = max(value.r, max(value.g, value.b));
    return value;
  }

  vec4 combineLayer(vec4 base, vec4 layer, int colorMode, int alphaMode) {
    if (colorMode == 0) base.rgb *= layer.rgb;
    else if (colorMode == 1) base.rgb += layer.rgb;
    else if (colorMode == 2) base.rgb -= layer.rgb;
    else if (colorMode == 3) base.rgb = max(base.rgb, layer.rgb);
    else if (colorMode == 4) base.rgb = min(base.rgb, layer.rgb);
    else base.rgb *= layer.rgb;
    if (alphaMode == 0) base.a *= layer.a;
    else if (alphaMode == 1) base.a = max(base.a, layer.a);
    else if (alphaMode == 2) base.a = min(base.a, layer.a);
    return base;
  }

  void main() {
    vec4 result = vec4(1.0);
    float hasTexture = 0.0;
    if (uTextureEnabled0 > 0.5) {
      result = prepareLayer(texture2D(uTexture0, transformUv(uvSet(uUvSet0), uUvTransform0, uUvRotation0)), uColorToAlpha0);
      hasTexture = 1.0;
    }
    if (uTextureEnabled1 > 0.5) {
      vec4 layer = prepareLayer(texture2D(uTexture1, transformUv(uvSet(uUvSet1), uUvTransform1, uUvRotation1)), uColorToAlpha1);
      result = hasTexture > 0.5 ? combineLayer(result, layer, uColorMode1, uAlphaMode1) : layer;
      hasTexture = 1.0;
    }
    if (uTextureEnabled2 > 0.5) {
      vec4 layer = prepareLayer(texture2D(uTexture2, transformUv(uvSet(uUvSet2), uUvTransform2, uUvRotation2)), uColorToAlpha2);
      result = hasTexture > 0.5 ? combineLayer(result, layer, uColorMode2, uAlphaMode2) : layer;
      hasTexture = 1.0;
    }
    if (uTextureEnabled3 > 0.5) {
      vec4 layer = prepareLayer(texture2D(uTexture3, transformUv(uvSet(uUvSet3), uUvTransform3, uUvRotation3)), uColorToAlpha3);
      result = hasTexture > 0.5 ? combineLayer(result, layer, uColorMode3, uAlphaMode3) : layer;
    }
    result.rgb *= uTint * uBrightness * vAvfxColor.rgb;
    result.a *= uOpacity * vAvfxColor.a;
    if (result.a <= 0.002) discard;
    gl_FragColor = result;
    #include <colorspace_fragment>
    #include <premultiplied_alpha_fragment>
  }
`

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
  const textureCache = new Map<string, THREE.Texture>()
  const fallbackTexture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1)
  fallbackTexture.needsUpdate = true
  const geometryCache = avfx.models.map((source) => {
    const geometry = modelGeometry(source)
    return geometry ? ensureShaderAttributes(geometry) : undefined
  })
  const proceduralGeometryCache = new Map<number, THREE.BufferGeometry>()
  const emitters: RuntimeEmitter[] = []
  const particles: RuntimeParticle[] = []
  const activeChildrenByDefinition = new Uint32Array(avfx.emitters.length)
  const changeActiveChildren = (definition: number, amount: number) => {
    activeChildrenByDefinition[definition] = Math.max(0, (activeChildrenByDefinition[definition] ?? 0) + amount)
  }
  let seed = 0x4f6d6567
  let globalFrame = 0
  const startedTimelineItems = new Set<number>()
  const mainTimeline = avfx.timelines.find((timeline) => timeline.items.some((item) => item.emitter >= 0))
  const loopEnd = mainTimeline?.loopEnd && mainTimeline.loopEnd > 0 ? mainTimeline.loopEnd : 0

  const textureFor = (binding: AvfxTextureBinding): THREE.Texture | undefined => {
    const index = binding.textureIndices[0]
    if (index === undefined) return undefined
    const key = `${index}:${binding.filter}:${binding.borderU}:${binding.borderV}`
    const cached = textureCache.get(key)
    if (cached) return cached
    const path = avfx.textures[index]
    const source = path ? textureSources.get(path) : undefined
    if (!source) return undefined
    const map = decodedTexture(source, anisotropy)
    map.wrapS = wrapping(binding.borderU)
    map.wrapT = wrapping(binding.borderV)
    map.magFilter = binding.filter === 0 ? THREE.NearestFilter : THREE.LinearFilter
    textureCache.set(key, map)
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

  const addEmitter = (
    definition: number,
    position = new THREE.Vector3(),
    parentSeed = seed++,
    parentDefinition?: number,
  ): boolean => {
    const source = avfx.emitters[definition]
    if (!source) return false
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
      ...(parentDefinition !== undefined ? { parentDefinition } : {}),
    })
    if (parentDefinition !== undefined) changeActiveChildren(parentDefinition, 1)
    return true
  }

  const materialFor = (definition: AvfxParticleDefinition) => {
    const layers = definition.colorTextures
      .filter((binding) => binding.enabled && binding.textureIndices.length)
      .map((binding) => ({ binding, map: textureFor(binding) }))
      .filter((layer): layer is { binding: AvfxTextureBinding; map: THREE.Texture } => Boolean(layer.map))
      .slice(0, 4)
    const uniforms: Record<string, THREE.IUniform> = {
      uTint: { value: new THREE.Color(1, 1, 1) },
      uBrightness: { value: 1 },
      uOpacity: { value: 1 },
      uBillboard: { value: definition.type === 1 ? 1 : 0 },
    }
    for (let index = 0; index < 4; index++) {
      const layer = layers[index]
      uniforms[`uTexture${index}`] = { value: layer?.map ?? fallbackTexture }
      uniforms[`uTextureEnabled${index}`] = { value: layer ? 1 : 0 }
      uniforms[`uColorToAlpha${index}`] = { value: layer?.binding.colorToAlpha ? 1 : 0 }
      uniforms[`uColorMode${index}`] = { value: layer?.binding.colorMode ?? 0 }
      uniforms[`uAlphaMode${index}`] = { value: layer?.binding.alphaMode ?? 0 }
      uniforms[`uUvSet${index}`] = { value: Math.max(0, Math.min(3, layer?.binding.uvSet ?? 0)) }
      uniforms[`uUvTransform${index}`] = { value: new THREE.Vector4(1, 1, 0, 0) }
      uniforms[`uUvRotation${index}`] = { value: 0 }
    }
    const blendMode = blending(definition.drawMode)
    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: AVFX_VERTEX_SHADER,
      fragmentShader: AVFX_FRAGMENT_SHADER,
      transparent: true,
      blending: blendMode,
      premultipliedAlpha: blendMode === THREE.MultiplyBlending || blendMode === THREE.SubtractiveBlending,
      depthTest: definition.depthTest,
      depthWrite: definition.depthWrite,
      toneMapped: false,
      side: THREE.DoubleSide,
    })
    configureBlendState(material, definition.drawMode)
    return { material, layers: layers.map((layer) => layer.binding) }
  }

  const addParticle = (rule: AvfxSpawnRule, parent: RuntimeEmitter, instanceSeed: number): boolean => {
    const definition = avfx.particles[rule.target]
    if (!definition || particles.length >= MAX_PARTICLES) return false
    const modelIndex = definition.modelIndices[Math.floor(seeded(instanceSeed + 7) * Math.max(definition.modelIndices.length, 1))]
    const authoredGeometry = modelIndex === undefined ? undefined : geometryCache[modelIndex]
    const { material, layers } = materialFor(definition)
    // Type 5 without an authored mesh is a polyline (beam/streak). Give it its
    // own dynamic ribbon geometry, rebuilt from the spawn point's motion each
    // frame, instead of the flat quad that made it read as a white slab.
    const isPolyline = definition.type === 5 && !authoredGeometry
    let trail: TrailState | undefined
    let geometry: THREE.BufferGeometry
    if (isPolyline) {
      trail = createRibbonGeometry(TRAIL_POINTS)
      geometry = trail.geometry
      material.uniforms.uBillboard!.value = 0
    } else {
      let proceduralGeometry = proceduralGeometryCache.get(rule.target)
      if (!authoredGeometry && !proceduralGeometry) {
        proceduralGeometry = ensureShaderAttributes(definition.type === 12 ? discGeometry(definition) : spriteGeometry())
        proceduralGeometryCache.set(rule.target, proceduralGeometry)
      }
      geometry = authoredGeometry ?? proceduralGeometry!
    }
    const object = new THREE.Mesh(geometry, material)
    object.name = `avfx-particle-${rule.target}`
    object.renderOrder = 20 + definition.drawPriority
    // The ribbon already lives in group space; its own bounds churn each frame,
    // so skip frustum culling rather than recompute a bounding sphere per frame.
    if (isPolyline) object.frustumCulled = false
    const local = parent.definition >= 0 && avfx.emitters[parent.definition]?.type === 5
      ? sampleEmitterPoint(avfx.emitters[parent.definition]!, instanceSeed)
      : new THREE.Vector3()
    local.multiply(parent.scale).applyEuler(parent.rotation)
    const position = rule.positionInfluence ? parent.position.clone().add(local) : local
    if (trail) trail.points.push(position.clone())
    else object.position.copy(position)
    group.add(object)
    const randomLife = definition.lifeRandom ? randomSigned(instanceSeed + 67) * definition.lifeRandom : 0
    particles.push({
      definition,
      object,
      material,
      textureLayers: layers,
      age: rule.startFrame,
      life: rule.overrideLife ?? Math.max(1, definition.life + randomLife),
      position,
      velocity: new THREE.Vector3(),
      rotation: rule.rotationInfluence ? parent.rotation.clone() : new THREE.Euler(),
      inheritedScale: rule.scaleInfluence ? parent.scale.clone() : new THREE.Vector3(1, 1, 1),
      seed: instanceSeed,
      parentDefinition: parent.definition,
      ...(trail ? { trail } : {}),
    })
    changeActiveChildren(parent.definition, 1)
    return true
  }

  const triggerRule = (rule: AvfxSpawnRule, parent: RuntimeEmitter, emitterRule: boolean) => {
    const source = avfx.emitters[parent.definition]
    const randomCount = curveRandom(source?.createCountRandom, parent.age, parent.seed + 107)
    const count = Math.max(1, Math.round(evaluateAvfxCurve(source?.createCount, parent.age, 1) + randomCount)) * Math.max(1, rule.createCount)
    for (let index = 0; index < count; index++) {
      if (source?.childLimit && (activeChildrenByDefinition[parent.definition] ?? 0) >= source.childLimit) break
      const instanceSeed = seed++
      if (seeded(instanceSeed + 101) * 100 > rule.probability) continue
      if (emitterRule) {
        const local = source?.type === 5 ? sampleEmitterPoint(source, instanceSeed) : new THREE.Vector3()
        local.multiply(parent.scale).applyEuler(parent.rotation)
        addEmitter(rule.target, parent.position.clone().add(local), instanceSeed, parent.definition)
      } else addParticle(rule, parent, instanceSeed)
    }
  }

  const clearGraph = () => {
    for (const particle of particles.splice(0)) {
      group.remove(particle.object)
      particle.material.dispose()
      particle.trail?.geometry.dispose()
    }
    emitters.length = 0
    activeChildrenByDefinition.fill(0)
    startedTimelineItems.clear()
  }

  const resetGraph = () => {
    clearGraph()
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
    particleBounds() {
      const box = new THREE.Box3()
      for (const particle of particles) box.expandByPoint(particle.object.position)
      return box
    },
    renderedBounds() {
      const box = new THREE.Box3()
      const slot = new THREE.Box3()
      for (const particle of particles) {
        if (!(particle.object instanceof THREE.Mesh)) continue
        const geometry = particle.object.geometry
        if (!geometry.boundingBox) geometry.computeBoundingBox()
        if (!geometry.boundingBox) continue
        particle.object.updateMatrix()
        slot.copy(geometry.boundingBox).applyMatrix4(particle.object.matrix)
        box.union(slot)
      }
      return box
    },
    update(deltaSeconds: number, camera?: THREE.Camera) {
      const deltaFrames = Math.min(deltaSeconds, 0.1) * avfx.framesPerSecond
      // Ribbon particles widen across the view, so resolve the camera position
      // in this graph's local frame once per tick (identity fallback in warmup).
      let localCamera: THREE.Vector3 | undefined
      if (camera) {
        group.updateWorldMatrix(true, false)
        localCamera = group.worldToLocal(camera.getWorldPosition(new THREE.Vector3()))
      }
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
        const interval = Math.max(
          1,
          evaluateAvfxCurve(definition.createInterval, frame, 1)
            + curveRandom(definition.createIntervalRandom, frame, emitter.seed + 149),
        )
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
        if (emitter.age > definition.life) {
          if (emitter.parentDefinition !== undefined) {
            changeActiveChildren(emitter.parentDefinition, -1)
          }
          emitters.splice(emitterIndex, 1)
        }
      }
      for (let index = particles.length - 1; index >= 0; index--) {
        const particle = particles[index]!
        particle.age += deltaFrames
        if (particle.age >= particle.life) {
          group.remove(particle.object)
          particle.material.dispose()
          particle.trail?.geometry.dispose()
          changeActiveChildren(particle.parentDefinition, -1)
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
        const head = particle.position.clone().add(authoredPosition).addScaledVector(particle.velocity, particle.age / avfx.framesPerSecond)
        const authoredScale = vectorAt(particle.definition.scale, frame, 1, particle.seed)
        if (particle.trail) {
          // Advance the ribbon: append the new head, drop the oldest, rebuild the
          // strip. Length comes from the motion history; width is the thin
          // authored scale axis so long streaks stay slender instead of fanning.
          particle.trail.points.push(head)
          if (particle.trail.points.length > particle.trail.capacity) particle.trail.points.shift()
          const width = Math.min(Math.abs(authoredScale.x), Math.abs(authoredScale.y))
            * Math.min(particle.inheritedScale.x, particle.inheritedScale.y)
          rebuildTrail(particle.trail, width, localCamera)
        } else {
          particle.object.position.copy(head)
          const rotation = vectorAt(particle.definition.rotation, frame, 0, particle.seed)
          const rotationVelocity = vectorAt(particle.definition.rotationVelocity, frame, 0, particle.seed + 83)
          particle.object.rotation.set(
            particle.rotation.x + rotation.x + rotationVelocity.x * frame,
            particle.rotation.y + rotation.y + rotationVelocity.y * frame,
            particle.rotation.z + rotation.z + rotationVelocity.z * frame,
          )
          // Disc and LightModel particles author their visible radius in Scale X.
          // Their Y/Z curve channels control engine-specific light/disc behavior;
          // applying them as mesh axes turns values such as Omega's Z=10 into
          // twenty-metre wedges instead of a compact circular light model.
          if (particle.definition.type === 12 || particle.definition.type === 13) authoredScale.setScalar(authoredScale.x)
          particle.object.scale.copy(authoredScale).multiply(particle.inheritedScale)
        }
        const color = colorAt(particle.definition.color, frame)
        const brightness = evaluateAvfxCurve(particle.definition.color.brightness, frame, 1)
        ;(particle.material.uniforms.uTint!.value as THREE.Color).copy(color)
        particle.material.uniforms.uBrightness!.value = brightness
        particle.material.uniforms.uOpacity!.value = THREE.MathUtils.clamp(
          evaluateAvfxCurve(particle.definition.color.alpha, frame, 1) * evaluateAvfxCurve(particle.definition.color.scaleAlpha, frame, 1),
          0,
          1,
        )
        particle.textureLayers.forEach((binding, layerIndex) => {
          const uv = particle.definition.uvSets[binding.uvSet]
          if (!uv) return
          const scale = vectorAt(uv.scale, frame, 1, particle.seed)
          const scroll = vectorAt(uv.scroll, frame, 0, particle.seed)
          ;(particle.material.uniforms[`uUvTransform${layerIndex}`]!.value as THREE.Vector4).set(scale.x, scale.y, scroll.x, scroll.y)
          particle.material.uniforms[`uUvRotation${layerIndex}`]!.value = evaluateAvfxCurve(uv.rotation, frame)
        })
      }
    },
    dispose() {
      clearGraph()
      textureCache.forEach((texture) => texture.dispose())
      textureCache.clear()
      fallbackTexture.dispose()
      for (const geometry of geometryCache) geometry?.dispose()
      proceduralGeometryCache.forEach((geometry) => geometry.dispose())
      proceduralGeometryCache.clear()
      target.remove(group)
    },
  }
}
