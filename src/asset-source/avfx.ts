const EFFECT_TEXTURE = /chara\/[a-z0-9_./-]+\.atex/gi

export interface AvfxNode {
  tag: string
  offset: number
  dataOffset: number
  size: number
  data: Uint8Array
  children?: AvfxNode[]
}

function tagAt(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + 4)).split('').reverse().filter((value) => value !== '\0').join('')
}

function padding(size: number): number {
  return (4 - size % 4) % 4
}

function looksLikeTag(tag: string): boolean {
  return tag.length > 0 && tag.length <= 4 && /^[A-Za-z0-9 ]+$/.test(tag)
}

function childNodes(bytes: Uint8Array, start: number, size: number, depth: number): AvfxNode[] | undefined {
  if (size < 8 || depth > 16) return undefined
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const end = start + size
  const nodes: AvfxNode[] = []
  let cursor = start
  while (cursor < end) {
    if (cursor + 8 > end) return undefined
    const tag = tagAt(bytes, cursor)
    const childSize = view.getInt32(cursor + 4, true)
    if (!looksLikeTag(tag) || childSize < 0) return undefined
    const dataOffset = cursor + 8
    const next = dataOffset + childSize + padding(childSize)
    if (next > end) return undefined
    const data = bytes.subarray(dataOffset, dataOffset + childSize)
    const children = childNodes(bytes, dataOffset, childSize, depth + 1)
    nodes.push({ tag, offset: cursor, dataOffset, size: childSize, data, ...(children ? { children } : {}) })
    cursor = next
  }
  return cursor === end && nodes.length ? nodes : undefined
}

/** Parses AVFX's reversed-fourCC, aligned TLV hierarchy while retaining raw leaves. */
export function parseAvfx(bytes: ArrayBuffer): AvfxNode {
  if (bytes.byteLength < 8) throw new Error('The AVFX header is truncated.')
  const raw = new Uint8Array(bytes)
  const view = new DataView(bytes)
  const tag = tagAt(raw, 0)
  const size = view.getInt32(4, true)
  if (tag !== 'AVFX') throw new Error(`Expected AVFX root, found ${tag || '(empty)'}.`)
  if (size < 0 || 8 + size > bytes.byteLength) throw new Error('The AVFX root size is invalid.')
  const data = raw.subarray(8, 8 + size)
  const children = childNodes(raw, 8, size, 0)
  if (!children) throw new Error('The AVFX root node table is malformed.')
  return { tag, offset: 0, dataOffset: 8, size, data, children }
}

export function avfxChildren(node: AvfxNode, tag: string): AvfxNode[] {
  return node.children?.filter((child) => child.tag === tag) ?? []
}

export function avfxInt(node: AvfxNode | undefined, fallback = 0): number {
  return node && node.size >= 4 ? new DataView(node.data.buffer, node.data.byteOffset, node.data.byteLength).getInt32(0, true) : fallback
}

export function avfxFloat(node: AvfxNode | undefined, fallback = 0): number {
  return node && node.size >= 4 ? new DataView(node.data.buffer, node.data.byteOffset, node.data.byteLength).getFloat32(0, true) : fallback
}

export interface AvfxCurveKey {
  frame: number
  interpolation: 0 | 1 | 2
  /** Outgoing and incoming horizontal Bezier handle factors. */
  outHandle: number
  inHandle: number
  value: number
}

export interface AvfxCurve {
  preBehavior: number
  postBehavior: number
  randomType: number
  keys: AvfxCurveKey[]
}

export interface AvfxVectorCurve {
  x?: AvfxCurve
  y?: AvfxCurve
  z?: AvfxCurve
  randomX?: AvfxCurve
  randomY?: AvfxCurve
  randomZ?: AvfxCurve
}

export interface AvfxColorCurve {
  rgb?: Array<{ frame: number; r: number; g: number; b: number }>
  alpha?: AvfxCurve
  scaleAlpha?: AvfxCurve
  brightness?: AvfxCurve
}

export interface AvfxSpawnRule {
  enabled: boolean
  target: number
  createTime: number
  createCount: number
  probability: number
  startFrame: number
  overrideLife?: number
  positionInfluence: boolean
  rotationInfluence: boolean
  scaleInfluence: boolean
}

export interface AvfxTextureBinding {
  enabled: boolean
  colorToAlpha: boolean
  textureIndices: number[]
  uvSet: number
  filter: number
  borderU: number
  borderV: number
  colorMode: number
  alphaMode: number
}

export interface AvfxUvSet {
  calculateMode: number
  scale: AvfxVectorCurve
  scroll: AvfxVectorCurve
  rotation?: AvfxCurve
  rotationRandom?: AvfxCurve
}

export interface AvfxEmitterDefinition {
  type: number
  life: number
  lifeRandom: number
  loopStart: number
  loopEnd: number
  createCount: AvfxCurve
  createCountRandom?: AvfxCurve
  createInterval: AvfxCurve
  createIntervalRandom?: AvfxCurve
  gravity?: AvfxCurve
  airResistance?: AvfxCurve
  position: AvfxVectorCurve
  rotation: AvfxVectorCurve
  scale: AvfxVectorCurve
  color: AvfxColorCurve
  particleRules: AvfxSpawnRule[]
  emitterRules: AvfxSpawnRule[]
  modelIndices: number[]
  generateMethod: number
}

export interface AvfxParticleDefinition {
  type: number
  life: number
  lifeRandom: number
  loopStart: number
  loopEnd: number
  drawMode: number
  drawPriority: number
  depthTest: boolean
  depthWrite: boolean
  gravity?: AvfxCurve
  airResistance?: AvfxCurve
  position: AvfxVectorCurve
  rotation: AvfxVectorCurve
  scale: AvfxVectorCurve
  rotationVelocity: AvfxVectorCurve
  color: AvfxColorCurve
  uvSets: AvfxUvSet[]
  colorTextures: AvfxTextureBinding[]
  normalTexture?: AvfxTextureBinding
  distortionTexture?: AvfxTextureBinding
  modelIndices: number[]
  data: Record<string, number | number[] | AvfxCurve | AvfxColorCurve>
}

export interface AvfxModelGeometry {
  positions: Float32Array
  normals: Float32Array
  colors: Uint8Array
  uvs: Float32Array
  indices: Uint16Array
  emitPositions: Float32Array
  emitNormals: Float32Array
  emitColors: Uint8Array
  emitOrder: Uint16Array
}

export interface AvfxTimelineItem {
  enabled: boolean
  startFrame: number
  endFrame: number
  binder: number
  effector: number
  emitter: number
  clip: number
}

export interface AvfxTimeline {
  loopStart: number
  loopEnd: number
  binder: number
  items: AvfxTimelineItem[]
}

export interface DecodedAvfx {
  version: number
  framesPerSecond: number
  textures: string[]
  timelines: AvfxTimeline[]
  emitters: AvfxEmitterDefinition[]
  particles: AvfxParticleDefinition[]
  models: AvfxModelGeometry[]
  rootEmitterIndices: number[]
  unsupportedParticleTypes: number[]
}

function lastChild(node: AvfxNode | undefined, tag: string): AvfxNode | undefined {
  return node?.children?.filter((child) => child.tag === tag).at(-1)
}

function nodeInt(node: AvfxNode | undefined, tag: string, fallback = 0): number {
  return avfxInt(lastChild(node, tag), fallback)
}

function nodeFloat(node: AvfxNode | undefined, tag: string, fallback = 0): number {
  return avfxFloat(lastChild(node, tag), fallback)
}

function nodeBool(node: AvfxNode | undefined, tag: string, fallback = false): boolean {
  const value = lastChild(node, tag)
  if (!value?.size) return fallback
  return value.size === 1 ? value.data[0] !== 0 : avfxInt(value) !== 0
}

function byteList(node: AvfxNode | undefined, tag: string): number[] {
  return [...(lastChild(node, tag)?.data ?? [])].filter((value) => value !== 0xff)
}

function indexList(node: AvfxNode | undefined, tag: string): number[] {
  const value = lastChild(node, tag)
  if (!value) return []
  return value.size === 4 ? [avfxInt(value)].filter((index) => index >= 0) : [...value.data].filter((index) => index !== 0xff)
}

function curveFrom(node: AvfxNode | undefined): AvfxCurve | undefined {
  const keysNode = lastChild(node, 'Keys')
  if (!node || !keysNode || keysNode.size % 16) return undefined
  const view = new DataView(keysNode.data.buffer, keysNode.data.byteOffset, keysNode.data.byteLength)
  const keys: AvfxCurveKey[] = []
  for (let offset = 0; offset < keysNode.size; offset += 16) {
    const interpolation = view.getInt16(offset + 2, true)
    keys.push({
      frame: view.getInt16(offset, true),
      interpolation: interpolation === 0 || interpolation === 2 ? interpolation : 1,
      outHandle: view.getFloat32(offset + 4, true),
      inHandle: view.getFloat32(offset + 8, true),
      value: view.getFloat32(offset + 12, true),
    })
  }
  return {
    preBehavior: nodeInt(node, 'BvPr'),
    postBehavior: nodeInt(node, 'BvPo'),
    randomType: nodeInt(node, 'RanT'),
    keys,
  }
}

function requiredCurve(node: AvfxNode | undefined, fallback = 1): AvfxCurve {
  return curveFrom(node) ?? { preBehavior: 0, postBehavior: 0, randomType: 0, keys: [{ frame: 0, interpolation: 1, outHandle: 1, inHandle: 1, value: fallback }] }
}

function vectorCurve(node: AvfxNode | undefined): AvfxVectorCurve {
  const result: AvfxVectorCurve = {}
  const assignments: Array<[keyof AvfxVectorCurve, string]> = [
    ['x', 'X'], ['y', 'Y'], ['z', 'Z'],
    ['randomX', 'XR'], ['randomY', 'YR'], ['randomZ', 'ZR'],
  ]
  for (const [key, tag] of assignments) {
    const curve = curveFrom(lastChild(node, tag))
    if (curve) result[key] = curve
  }
  return result
}

function colorCurve(node: AvfxNode | undefined): AvfxColorCurve {
  const result: AvfxColorCurve = {}
  const rgbKeys = lastChild(lastChild(node, 'RGB'), 'Keys')
  if (rgbKeys && rgbKeys.size % 16 === 0) {
    const view = new DataView(rgbKeys.data.buffer, rgbKeys.data.byteOffset, rgbKeys.data.byteLength)
    result.rgb = []
    for (let offset = 0; offset < rgbKeys.size; offset += 16) {
      result.rgb.push({
        frame: view.getInt16(offset, true),
        r: view.getFloat32(offset + 4, true),
        g: view.getFloat32(offset + 8, true),
        b: view.getFloat32(offset + 12, true),
      })
    }
  }
  result.alpha = curveFrom(lastChild(node, 'A'))
  result.scaleAlpha = curveFrom(lastChild(node, 'SclA'))
  result.brightness = curveFrom(lastChild(node, 'Bri'))
  return result
}

function splitRecords(node: AvfxNode | undefined, firstTag: string): AvfxNode[][] {
  const records: AvfxNode[][] = []
  for (const child of node?.children ?? []) {
    if (child.tag === firstTag) records.push([])
    records.at(-1)?.push(child)
  }
  return records
}

function recordInt(record: AvfxNode[], tag: string, fallback = 0): number {
  return avfxInt(record.find((field) => field.tag === tag), fallback)
}

function recordBool(record: AvfxNode[], tag: string, fallback = false): boolean {
  const field = record.find((value) => value.tag === tag)
  if (!field?.size) return fallback
  return field.size === 1 ? field.data[0] !== 0 : avfxInt(field) !== 0
}

function spawnRules(node: AvfxNode | undefined): AvfxSpawnRule[] {
  return splitRecords(node, 'bEnb').map((record) => ({
    enabled: recordBool(record, 'bEnb'),
    target: recordInt(record, 'TgtB', -1),
    createTime: Math.max(0, recordInt(record, 'CrTm', 1)),
    createCount: Math.max(0, recordInt(record, 'CrCn', 1)),
    probability: Math.max(0, recordInt(record, 'CrPr', 100)),
    startFrame: recordInt(record, 'StFr'),
    ...(recordBool(record, 'bOvr') ? { overrideLife: Math.max(1, recordInt(record, 'OvrV', 60)) } : {}),
    positionInfluence: recordBool(record, 'ICbP', true),
    rotationInfluence: recordBool(record, 'ICbR'),
    scaleInfluence: recordBool(record, 'ICbS'),
  })).filter((rule) => rule.target >= 0)
}

function textureBinding(node: AvfxNode | undefined): AvfxTextureBinding | undefined {
  if (!node) return undefined
  const direct = nodeInt(node, 'TxNo', -1)
  const list = byteList(node, 'TLst')
  const textureIndices = direct >= 0 ? [direct] : list
  return {
    enabled: nodeBool(node, 'bEna'),
    colorToAlpha: nodeBool(node, 'bC2A'),
    textureIndices,
    uvSet: nodeInt(node, 'UvSN'),
    filter: nodeInt(node, 'TFT', 1),
    borderU: nodeInt(node, 'TBUT', 1),
    borderV: nodeInt(node, 'TBVT', 1),
    colorMode: nodeInt(node, 'TCCT'),
    alphaMode: nodeInt(node, 'TCAT'),
  }
}

function uvSet(node: AvfxNode): AvfxUvSet {
  return {
    calculateMode: nodeInt(node, 'CUvT'),
    scale: vectorCurve(lastChild(node, 'Scl')),
    scroll: vectorCurve(lastChild(node, 'Scr')),
    rotation: curveFrom(lastChild(node, 'Rot')),
    rotationRandom: curveFrom(lastChild(node, 'RotR')),
  }
}

function genericData(node: AvfxNode | undefined): Record<string, number | number[] | AvfxCurve | AvfxColorCurve> {
  const result: Record<string, number | number[] | AvfxCurve | AvfxColorCurve> = {}
  const integerTags = new Set(['PrtC', 'PCnU', 'PCnV', 'MNO', 'MNRv', 'MNRt', 'MNRi', 'FrsT', 'DLT', 'PLT', 'MdNo', 'SS', 'LgtT'])
  for (const child of node?.children ?? []) {
    const curve = curveFrom(child)
    if (curve) result[child.tag] = curve
    else if (lastChild(child, 'RGB')) result[child.tag] = colorCurve(child)
    else if (child.size === 4) result[child.tag] = integerTags.has(child.tag) ? avfxInt(child) : avfxFloat(child)
    else if (!child.children) result[child.tag] = [...child.data]
  }
  return result
}

function decodeEmitter(node: AvfxNode): AvfxEmitterDefinition {
  const particleContainer = avfxChildren(node, 'ItPr').at(-1)
  const emitterContainer = avfxChildren(node, 'ItEm').at(-1)
  const particleRules = spawnRules(particleContainer)
  // ItEm is cumulative and begins by repeating the particle rules.
  const emitterRules = spawnRules(emitterContainer).slice(nodeInt(node, 'PrCn', particleRules.length))
  const data = lastChild(node, 'Data')
  return {
    type: nodeInt(node, 'EVT'),
    life: nodeFloat(lastChild(node, 'Life'), 'Val', 60),
    lifeRandom: nodeFloat(lastChild(node, 'Life'), 'ValR'),
    loopStart: nodeInt(node, 'LpSt'),
    loopEnd: nodeInt(node, 'LpEd'),
    createCount: requiredCurve(lastChild(node, 'CrC')),
    createCountRandom: curveFrom(lastChild(node, 'CrCR')),
    createInterval: requiredCurve(lastChild(node, 'CrI'), 1),
    createIntervalRandom: curveFrom(lastChild(node, 'CrIR')),
    gravity: curveFrom(lastChild(node, 'Gra')),
    airResistance: curveFrom(lastChild(node, 'ARs')),
    position: vectorCurve(lastChild(node, 'Pos')),
    rotation: vectorCurve(lastChild(node, 'Rot')),
    scale: vectorCurve(lastChild(node, 'Scl')),
    color: colorCurve(lastChild(node, 'Col')),
    particleRules,
    emitterRules,
    modelIndices: indexList(data, 'MdNo'),
    generateMethod: nodeInt(data, 'GeMT'),
  }
}

function decodeParticle(node: AvfxNode): AvfxParticleDefinition {
  const dataNode = lastChild(node, 'Data')
  const textures = ['TC1', 'TC2', 'TC3', 'TC4'].map((tag) => textureBinding(lastChild(node, tag))).filter((value): value is AvfxTextureBinding => Boolean(value))
  return {
    type: nodeInt(node, 'PrVT'),
    life: nodeFloat(lastChild(node, 'Life'), 'Val', 60),
    lifeRandom: nodeFloat(lastChild(node, 'Life'), 'ValR'),
    loopStart: nodeInt(node, 'LpSt'),
    loopEnd: nodeInt(node, 'LpEd'),
    drawMode: nodeInt(node, 'RMT'),
    drawPriority: nodeInt(node, 'DwPr'),
    depthTest: nodeBool(node, 'DsDt', true),
    depthWrite: nodeBool(node, 'DsDw'),
    gravity: curveFrom(lastChild(node, 'Gra')),
    airResistance: curveFrom(lastChild(node, 'ARs')),
    position: vectorCurve(lastChild(node, 'Pos')),
    rotation: vectorCurve(lastChild(node, 'Rot')),
    scale: vectorCurve(lastChild(node, 'Scl')),
    rotationVelocity: {
      x: curveFrom(lastChild(node, 'VRX')),
      y: curveFrom(lastChild(node, 'VRY')),
      z: curveFrom(lastChild(node, 'VRZ')),
      randomX: curveFrom(lastChild(node, 'VRXR')),
      randomY: curveFrom(lastChild(node, 'VRYR')),
      randomZ: curveFrom(lastChild(node, 'VRZR')),
    },
    color: colorCurve(lastChild(node, 'Col')),
    uvSets: avfxChildren(node, 'UvSt').map(uvSet),
    colorTextures: textures,
    normalTexture: textureBinding(lastChild(node, 'TN')),
    distortionTexture: textureBinding(lastChild(node, 'TD')),
    modelIndices: [...indexList(dataNode, 'MdNo'), ...indexList(dataNode, 'MNO')],
    data: genericData(dataNode),
  }
}

function halfFloat(value: number): number {
  const sign = value & 0x8000 ? -1 : 1
  const exponent = value >> 10 & 0x1f
  const fraction = value & 0x3ff
  if (exponent === 0) return sign * fraction * 2 ** -24
  if (exponent === 31) return fraction ? Number.NaN : sign * Number.POSITIVE_INFINITY
  return sign * (1 + fraction / 1024) * 2 ** (exponent - 15)
}

function decodeModel(node: AvfxNode): AvfxModelGeometry {
  const vertexNode = lastChild(node, 'VDrw')
  const indexNode = lastChild(node, 'VIdx')
  const emitNode = lastChild(node, 'VEmt')
  const orderNode = lastChild(node, 'VNum')
  const vertexCount = Math.floor((vertexNode?.size ?? 0) / 36)
  const positions = new Float32Array(vertexCount * 3)
  const normals = new Float32Array(vertexCount * 3)
  const colors = new Uint8Array(vertexCount * 4)
  const uvs = new Float32Array(vertexCount * 2)
  if (vertexNode) {
    const view = new DataView(vertexNode.data.buffer, vertexNode.data.byteOffset, vertexNode.data.byteLength)
    for (let index = 0; index < vertexCount; index++) {
      const offset = index * 36
      positions.set([halfFloat(view.getUint16(offset, true)), halfFloat(view.getUint16(offset + 2, true)), halfFloat(view.getUint16(offset + 4, true))], index * 3)
      normals.set([(vertexNode.data[offset + 8]! - 128) / 127, (vertexNode.data[offset + 9]! - 128) / 127, (vertexNode.data[offset + 10]! - 128) / 127], index * 3)
      colors.set(vertexNode.data.subarray(offset + 16, offset + 20), index * 4)
      uvs.set([halfFloat(view.getUint16(offset + 20, true)), halfFloat(view.getUint16(offset + 22, true))], index * 2)
    }
  }
  const indices = new Uint16Array(indexNode?.size ? indexNode.size / 2 : 0)
  if (indexNode) {
    const view = new DataView(indexNode.data.buffer, indexNode.data.byteOffset, indexNode.data.byteLength)
    for (let index = 0; index < indices.length; index++) indices[index] = view.getUint16(index * 2, true)
  }
  const emitCount = Math.floor((emitNode?.size ?? 0) / 28)
  const emitPositions = new Float32Array(emitCount * 3)
  const emitNormals = new Float32Array(emitCount * 3)
  const emitColors = new Uint8Array(emitCount * 4)
  if (emitNode) {
    const view = new DataView(emitNode.data.buffer, emitNode.data.byteOffset, emitNode.data.byteLength)
    for (let index = 0; index < emitCount; index++) {
      const offset = index * 28
      emitPositions.set([view.getFloat32(offset, true), view.getFloat32(offset + 4, true), view.getFloat32(offset + 8, true)], index * 3)
      emitNormals.set([view.getFloat32(offset + 12, true), view.getFloat32(offset + 16, true), view.getFloat32(offset + 20, true)], index * 3)
      emitColors.set(emitNode.data.subarray(offset + 24, offset + 28), index * 4)
    }
  }
  const emitOrder = new Uint16Array(orderNode?.size ? orderNode.size / 2 : 0)
  if (orderNode) {
    const view = new DataView(orderNode.data.buffer, orderNode.data.byteOffset, orderNode.data.byteLength)
    for (let index = 0; index < emitOrder.length; index++) emitOrder[index] = view.getUint16(index * 2, true)
  }
  return { positions, normals, colors, uvs, indices, emitPositions, emitNormals, emitColors, emitOrder }
}

function decodeTimeline(node: AvfxNode): AvfxTimeline {
  const records = splitRecords(avfxChildren(node, 'Item').at(-1), 'bEna')
  return {
    loopStart: nodeInt(node, 'LpSt'),
    loopEnd: nodeInt(node, 'LpEd'),
    binder: nodeInt(node, 'BnNo', -1),
    items: records.map((record) => ({
      enabled: recordBool(record, 'bEna'),
      startFrame: recordInt(record, 'StTm'),
      endFrame: recordInt(record, 'EdTm'),
      binder: recordInt(record, 'BdNo', -1),
      effector: recordInt(record, 'EfNo', -1),
      emitter: recordInt(record, 'EmNo', -1),
      clip: recordInt(record, 'ClNo', -1),
    })),
  }
}

/** Decodes authored AVFX curves, graph links, texture indices, and embedded geometry. */
export function decodeAvfx(bytes: ArrayBuffer): DecodedAvfx {
  const root = parseAvfx(bytes)
  const timelines = avfxChildren(root, 'TmLn').map(decodeTimeline)
  const emitters = avfxChildren(root, 'Emit').map(decodeEmitter)
  const particles = avfxChildren(root, 'Ptcl').map(decodeParticle)
  const textures = avfxChildren(root, 'Tex').map((node) => new TextDecoder().decode(node.data).replaceAll('\0', '').toLowerCase())
  const primaryTimeline = timelines.find((timeline) => timeline.items.some((item) => item.emitter >= 0))
  const rootEmitterIndices = [...new Set(primaryTimeline?.items.filter((item) => item.enabled && item.startFrame === 0 && item.emitter >= 0).map((item) => item.emitter) ?? [0])]
  // The browser runtime currently has authored geometry paths for the four
  // families used by equipment effects such as Ultimate Omega. Other AVFX
  // particle families stay visible through diagnostics instead of being
  // silently presented as exact.
  const supported = new Set([1, 5, 12, 13])
  return {
    version: nodeInt(root, 'Ver'),
    // AVFX timeline/curve keys are authored in 60 Hz frame units. SPFR is the
    // soft-particle fade range, not a playback-rate field.
    framesPerSecond: 60,
    textures,
    timelines,
    emitters,
    particles,
    models: avfxChildren(root, 'Modl').map(decodeModel),
    rootEmitterIndices,
    unsupportedParticleTypes: [...new Set(particles.map((particle) => particle.type).filter((type) => !supported.has(type)))],
  }
}

function cubic(value0: number, value1: number, value2: number, value3: number, t: number): number {
  const inverse = 1 - t
  return inverse ** 3 * value0 + 3 * inverse ** 2 * t * value1 + 3 * inverse * t ** 2 * value2 + t ** 3 * value3
}

/** Evaluates Const/Repeat/Add curve behavior and Linear/Step/Spline keys. */
export function evaluateAvfxCurve(curve: AvfxCurve | undefined, frame: number, fallback = 0): number {
  if (!curve?.keys.length) return fallback
  const keys = curve.keys
  const first = keys[0]!
  const last = keys.at(-1)!
  let sample = frame
  let additiveCycles = 0
  if (sample < first.frame) {
    const span = last.frame - first.frame
    if ((curve.preBehavior === 1 || curve.preBehavior === 2) && span > 0) {
      const cycles = Math.ceil((first.frame - sample) / span)
      sample += cycles * span
      if (curve.preBehavior === 2) additiveCycles = -cycles
    } else return first.value
  } else if (sample > last.frame) {
    const span = last.frame - first.frame
    if ((curve.postBehavior === 1 || curve.postBehavior === 2) && span > 0) {
      const cycles = Math.floor((sample - first.frame) / span)
      sample -= cycles * span
      if (curve.postBehavior === 2) additiveCycles = cycles
    } else return last.value
  }
  let value = last.value
  for (let index = 0; index + 1 < keys.length; index++) {
    const left = keys[index]!
    const right = keys[index + 1]!
    if (sample < left.frame || sample > right.frame) continue
    const span = right.frame - left.frame
    if (span <= 0 || left.interpolation === 2) value = left.value
    else if (left.interpolation === 1) value = left.value + (right.value - left.value) * ((sample - left.frame) / span)
    else {
      const targetX = (sample - left.frame) / span
      const handle1 = Math.max(0, Math.min(1, left.outHandle / 2))
      const handle2 = 1 - Math.max(0, Math.min(1, left.inHandle / 2))
      let low = 0
      let high = 1
      for (let iteration = 0; iteration < 14; iteration++) {
        const middle = (low + high) / 2
        if (cubic(0, handle1, handle2, 1, middle) < targetX) low = middle
        else high = middle
      }
      value = cubic(left.value, left.value, right.value, right.value, (low + high) / 2)
    }
    break
  }
  return value + additiveCycles * (last.value - first.value)
}

/** Extracts local ATEX references embedded in an AVFX container. */
export function avfxTexturePaths(bytes: ArrayBuffer): string[] {
  const text = new TextDecoder('latin1').decode(bytes)
  return [...new Set((text.match(EFFECT_TEXTURE) ?? []).map((path) => path.toLowerCase()))]
}

/** Prefers visible glow/aura/electric surfaces over distortion-only maps. */
export function previewVfxTexturePaths(paths: string[], limit = 6): string[] {
  const score = (path: string) => {
    const name = path.split('/').at(-1) ?? path
    return Number(/elct/.test(name)) * 14
      + Number(/glow|aura/.test(name)) * 12
      + Number(/ligt/.test(name)) * 10
      + Number(/tone/.test(name)) * 8
      + Number(/othr/.test(name)) * 4
      - Number(/dist/.test(name)) * 16
  }
  return [...paths].sort((left, right) => score(right) - score(left)).slice(0, limit)
}
