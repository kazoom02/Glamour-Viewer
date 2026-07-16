// Havok spline animation decoding follows the MIT-licensed FFXIVTools
// implementation by Inseok Lee, independently ported through Physis.

import {
  decodeHavokTagfile,
  havokObjectValue,
  havokValueArray,
  type HavokObject,
} from './sklb'

export interface DecodedAnimationTrack {
  boneIndex: number
  translations: Float32Array
  rotations: Float32Array
  scales: Float32Array
}

export interface DecodedAnimation {
  name: string
  path: string
  blendHint: 'normal' | 'additive'
  duration: number
  times: Float32Array
  tracks: DecodedAnimationTrack[]
}

export interface PapAnimationInfo {
  name: string
  havokIndex: number
}

export interface ParsedPapHeader {
  animations: PapAnimationInfo[]
  havokData: Uint8Array
}

interface Transform {
  translation: [number, number, number, number]
  rotation: [number, number, number, number]
  scale: [number, number, number, number]
}

function assertPap(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function aligned(value: number, alignment: number): number {
  if (!alignment) return value
  return Math.ceil(value / alignment) * alignment
}

class ByteReader {
  cursor = 0

  constructor(private readonly bytes: Uint8Array) {}

  private require(length: number) {
    assertPap(length >= 0 && this.cursor + length <= this.bytes.length, 'The PAP animation data is truncated.')
  }

  u8(): number {
    this.require(1)
    return this.bytes[this.cursor++]!
  }

  u16(): number {
    this.require(2)
    const value = this.bytes[this.cursor]! | (this.bytes[this.cursor + 1]! << 8)
    this.cursor += 2
    return value
  }

  f32(): number {
    this.require(4)
    const value = new DataView(this.bytes.buffer, this.bytes.byteOffset + this.cursor, 4).getFloat32(0, true)
    this.cursor += 4
    return value
  }

  align(alignment: number) {
    this.cursor = aligned(this.cursor, alignment)
    this.require(0)
  }

  skip(length: number) {
    this.require(length)
    this.cursor += length
  }

  raw(): Uint8Array {
    return this.bytes.subarray(this.cursor)
  }

  clone(): ByteReader {
    const result = new ByteReader(this.bytes)
    result.cursor = this.cursor
    return result
  }
}

function objectMember(object: HavokObject, name: string): HavokObject {
  const value = havokObjectValue(object, name)
  assertPap(typeof value === 'object' && value !== null && !Array.isArray(value) && 'type' in value, `The PAP ${name} object is malformed.`)
  return value as HavokObject
}

function numberMember(object: HavokObject, name: string): number {
  const value = havokObjectValue(object, name)
  assertPap(typeof value === 'number' && Number.isFinite(value), `The PAP ${name} value is malformed.`)
  return value
}

function numberArray(object: HavokObject, name: string): number[] {
  return havokValueArray(havokObjectValue(object, name), name).map((value) => {
    assertPap(typeof value === 'number' && Number.isFinite(value), `The PAP ${name} array is malformed.`)
    return value
  })
}

export function parsePapHeader(bytes: ArrayBuffer): ParsedPapHeader {
  assertPap(bytes.byteLength >= 26, 'The PAP header is truncated.')
  const view = new DataView(bytes)
  const magic = new TextDecoder().decode(new Uint8Array(bytes, 0, 4))
  assertPap(magic === 'pap ', 'The PAP magic is invalid.')
  const animationCount = view.getInt16(8, true)
  const infoOffset = view.getInt32(14, true)
  const havokOffset = view.getInt32(18, true)
  const timelineOffset = view.getInt32(22, true)
  assertPap(animationCount > 0 && animationCount <= 512, 'The PAP animation count is invalid.')
  assertPap(infoOffset >= 26 && havokOffset >= infoOffset + animationCount * 40, 'The PAP animation table is invalid.')
  assertPap(timelineOffset > havokOffset && timelineOffset <= bytes.byteLength, 'The PAP Havok range is invalid.')
  const animations = Array.from({ length: animationCount }, (_, index): PapAnimationInfo => {
    const offset = infoOffset + index * 40
    assertPap(offset + 40 <= havokOffset, 'The PAP animation table is truncated.')
    const rawName = new Uint8Array(bytes, offset, 32)
    const zero = rawName.indexOf(0)
    const name = new TextDecoder().decode(zero >= 0 ? rawName.subarray(0, zero) : rawName).trim()
    return { name: name || `animation-${index}`, havokIndex: view.getInt16(offset + 34, true) }
  })
  return { animations, havokData: new Uint8Array(bytes, havokOffset, timelineOffset - havokOffset) }
}

const ROTATION_ALIGNMENTS = [4, 1, 2, 1, 2, 4] as const
const ROTATION_BYTES = [4, 5, 6, 3, 2, 16] as const

function unpackPolar32(data: Uint8Array): [number, number, number, number] {
  assertPap(data.length >= 4, 'A PAP POLAR32 quaternion is truncated.')
  const input = new DataView(data.buffer, data.byteOffset, 4).getUint32(0, true)
  const low = input & 0x3ffff
  const high = ((input & 0x0ffc0000) >>> 18) / 1023
  const value = 1 - high * high
  const a = Math.sqrt(low)
  const b = low - a * a
  const c = a === 0 ? Number.MAX_VALUE : 1 / (a + a)
  const theta = a / 511 * (Math.PI / 2)
  const phi = b * c * (Math.PI / 2)
  const factor = Math.sqrt(Math.max(0, 1 - value * value))
  const result: [number, number, number, number] = [
    Math.sin(theta) * Math.cos(phi) * factor,
    Math.sin(theta) * Math.sin(phi) * factor,
    Math.cos(theta) * factor,
    value,
  ]
  const mask = input >>> 28
  for (let index = 0; index < 4; index += 1) if (mask & (1 << index)) result[index] = -result[index]!
  return result
}

function unpackThreeComp40(data: Uint8Array): [number, number, number, number] {
  // Preserve the original Havok byte-shuffle exactly. The packed value needs
  // eight readable bytes even though only five belong to this quaternion.
  assertPap(data.length >= 8, 'A PAP THREECOMP40 quaternion is truncated.')
  const permutationBytes = new Uint8Array(new Uint32Array([256, 513, 1027, 0]).buffer)
  const shuffled = new Uint8Array(16)
  for (let index = 0; index < shuffled.length; index += 1) shuffled[index] = data[permutationBytes[index]!]!
  const shuffledView = new DataView(shuffled.buffer)
  const packed = Array.from({ length: 4 }, (_, index) => shuffledView.getUint32(index * 4, true))
  packed[1] = packed[1]! >>> 4
  const masks = [4095, 4095, 4095, 0]
  const defaults = [0, 0, 0, 2047]
  const values = packed.map((value, index) => (((value & masks[index]!) | defaults[index]!) - 2047) / 2895)
  const sourceFlags = new DataView(data.buffer, data.byteOffset, 8).getUint32(4, true)
  let remaining = Math.sqrt(Math.max(0, 1 - values.reduce((sum, value) => sum + value * value, 0)))
  if ((sourceFlags & 64) === 64) remaining = -remaining
  if ((sourceFlags & 48) === 0) return [remaining, values[0]!, values[1]!, values[2]!]
  if ((sourceFlags & 48) === 16) return [values[0]!, remaining, values[1]!, values[2]!]
  if ((sourceFlags & 48) === 32) return [values[0]!, values[1]!, remaining, values[2]!]
  return [values[0]!, values[1]!, values[2]!, remaining]
}

function unpackThreeComp48(data: Uint8Array): [number, number, number, number] {
  assertPap(data.length >= 6, 'A PAP THREECOMP48 quaternion is truncated.')
  const view = new DataView(data.buffer, data.byteOffset, 6)
  const packed = [view.getUint16(0, true), view.getUint16(2, true), view.getUint16(4, true)]
  const components = [packed[0]! & 0x7fff, packed[1]! & 0x7fff, packed[2]! & 0x7fff]
  const missing = (((packed[1]! & 0x8000) >>> 14) | ((packed[0]! & 0x8000) >>> 15))
  const values = [0x3fff, 0x3fff, 0x3fff, 0x3fff]
  let target = missing === 0 ? 1 : 0
  values[target] = components[0]!
  target += 1 + Number(missing === target + 1)
  values[target] = components[1]!
  target += 1 + Number(missing === target + 1)
  values[target] = components[2]!
  const result = values.map((value) => (value - 16383) / 23169) as [number, number, number, number]
  let remaining = Math.sqrt(Math.max(0, 1 - result.reduce((sum, value) => sum + value * value, 0)))
  if (packed[2]! & 0x8000) remaining = -remaining
  result[missing] = remaining
  return result
}

function unpackQuaternion(quantization: number, data: Uint8Array): [number, number, number, number] {
  if (quantization === 0) return unpackPolar32(data)
  if (quantization === 1) return unpackThreeComp40(data)
  if (quantization === 2) return unpackThreeComp48(data)
  throw new Error(`Unsupported PAP rotation quantization ${quantization}.`)
}

function findSpan(n: number, degree: number, time: number, knots: Uint8Array): number {
  if (time >= knots[n + 1]!) return n
  if (time <= knots[0]!) return degree
  let low = degree
  let high = n + 1
  let middle = Math.floor((low + high) / 2)
  while (time < knots[middle]! || time >= knots[middle + 1]!) {
    if (time < knots[middle]!) high = middle
    else low = middle
    middle = Math.floor((low + high) / 2)
  }
  return middle
}

function readKnots(data: ByteReader, quantizedTime: number, frameDuration: number) {
  const n = data.u16()
  const degree = data.u8()
  const raw = data.raw()
  const span = findSpan(n, degree, quantizedTime, raw)
  const knots = Array.from({ length: degree * 2 }, (_, index) => (
    (raw[index + 1]! + span - degree) * frameDuration
  ))
  data.skip(n + degree + 2)
  return { n, degree, knots, span }
}

function evaluate(time: number, degree: number, knots: number[], points: Array<[number, number, number, number]>): [number, number, number, number] {
  if (degree === 0) return [...points[0]!] as [number, number, number, number]
  if (degree === 1) {
    const denominator = knots[1]! - knots[0]!
    const factor = denominator === 0 ? 0 : (time - knots[0]!) / denominator
    return points[0]!.map((value, index) => value + factor * (points[1]![index]! - value)) as [number, number, number, number]
  }
  assertPap(degree <= 3, `Unsupported PAP spline degree ${degree}.`)
  const weights = Array(16).fill(1) as number[]
  const low = Array(16).fill(0) as number[]
  const high = Array(16).fill(0) as number[]
  for (let i = 1; i <= degree; i += 1) {
    high[4 * i] = time - knots[degree - i]!
    low[4 * i] = knots[i + degree - 1]! - time
    let value = 0
    for (let j = 0; j < i; j += 1) {
      const denominator = low[4 * (j + 1)]! + high[4 * (i - j)]!
      const basis = denominator === 0 ? 0 : weights[4 * j]! / denominator
      weights[4 * j] = value + low[4 * (j + 1)]! * basis
      value = high[4 * (i - j)]! * basis
    }
    weights[4 * i] = value
  }
  const result: [number, number, number, number] = [0, 0, 0, 0]
  for (let point = 0; point <= degree; point += 1) {
    for (let component = 0; component < 4; component += 1) {
      result[component] = result[component]! + weights[4 * point]! * points[point]![component]!
    }
  }
  return result
}

function recompose(staticMask: number, dynamicMask: number, statics: number[], identity: number[], target: number[]) {
  for (let component = 0; component < 4; component += 1) {
    if (staticMask & (1 << component)) target[component] = statics[component]!
    if (dynamicMask & (1 << component)) target[component] = identity[component]!
  }
}

function readNurbsCurve(
  quantization: number,
  data: ByteReader,
  quantizedTime: number,
  frameDuration: number,
  time: number,
  mask: number,
  identity: [number, number, number, number],
): [number, number, number, number] {
  const minimum = [0, 0, 0, 1]
  const maximum = [0, 0, 0, 1]
  const statics = [0, 0, 0, 1]
  const curve = mask & 0xf0 ? readKnots(data, quantizedTime, frameDuration) : undefined
  data.align(4)
  for (let component = 0; component < 3; component += 1) {
    if (mask & (1 << component)) statics[component] = data.f32()
    else if (mask & (1 << (component + 4))) {
      minimum[component] = data.f32()
      maximum[component] = data.f32()
    }
  }
  const staticMask = mask & 0x0f
  const dynamicMask = ((~mask >>> 4) & (~mask & 0x0f)) & 0x0f
  if (!curve) {
    const result = [...identity]
    recompose(staticMask, dynamicMask, statics, identity, result)
    return result as [number, number, number, number]
  }
  assertPap(quantization === 0 || quantization === 1, `Unsupported PAP scalar quantization ${quantization}.`)
  const bytesPerComponent = quantization === 0 ? 1 : 2
  data.align(2)
  const componentCounts = [0, 1, 1, 2, 1, 2, 2, 3]
  const componentCount = componentCounts[(mask >>> 4) & 7]!
  const selected = data.clone()
  selected.skip(bytesPerComponent * componentCount * (curve.span - curve.degree))
  const points: Array<[number, number, number, number]> = []
  for (let point = 0; point <= curve.degree; point += 1) {
    const values = [0, 0, 0, 1]
    for (let component = 0; component < 3; component += 1) {
      if (!(mask & (1 << (component + 4)))) continue
      const packed = quantization === 0 ? selected.u8() : selected.u16()
      const maximumPacked = quantization === 0 ? 255 : 65535
      values[component] = packed / maximumPacked * (maximum[component]! - minimum[component]!) + minimum[component]!
    }
    recompose(staticMask, dynamicMask, statics, identity, values)
    points.push(values as [number, number, number, number])
  }
  data.skip(bytesPerComponent * componentCount * (curve.n + 1))
  return evaluate(time, curve.degree, curve.knots, points)
}

function readNurbsQuaternion(
  quantization: number,
  data: ByteReader,
  quantizedTime: number,
  frameDuration: number,
  time: number,
  mask: number,
): [number, number, number, number] {
  assertPap(quantization >= 0 && quantization < ROTATION_ALIGNMENTS.length, `Unsupported PAP rotation quantization ${quantization}.`)
  if (mask & 0xf0) {
    const curve = readKnots(data, quantizedTime, frameDuration)
    data.align(ROTATION_ALIGNMENTS[quantization]!)
    const bytesPerQuaternion = ROTATION_BYTES[quantization]!
    const selected = data.clone()
    selected.skip(bytesPerQuaternion * (curve.span - curve.degree))
    const points = Array.from({ length: curve.degree + 1 }, () => {
      const value = unpackQuaternion(quantization, selected.raw())
      selected.skip(bytesPerQuaternion)
      return value
    })
    data.skip(bytesPerQuaternion * (curve.n + 1))
    return evaluate(time, curve.degree, curve.knots, points)
  }
  if (mask & 0x0f) {
    data.align(ROTATION_ALIGNMENTS[quantization]!)
    const result = unpackQuaternion(quantization, data.raw())
    data.skip(ROTATION_BYTES[quantization]!)
    return result
  }
  return [0, 0, 0, 1]
}

class SplineAnimation {
  readonly duration: number
  private readonly trackCount: number
  private readonly frameCount: number
  private readonly blockCount: number
  private readonly maxFramesPerBlock: number
  private readonly maskAndQuantizationSize: number
  private readonly blockInverseDuration: number
  private readonly frameDuration: number
  private readonly blockOffsets: number[]
  private readonly data: Uint8Array

  constructor(object: HavokObject) {
    this.duration = numberMember(object, 'duration')
    this.trackCount = numberMember(object, 'numberOfTransformTracks')
    this.frameCount = numberMember(object, 'numFrames')
    this.blockCount = numberMember(object, 'numBlocks')
    this.maxFramesPerBlock = numberMember(object, 'maxFramesPerBlock')
    this.maskAndQuantizationSize = numberMember(object, 'maskAndQuantizationSize') >>> 0
    this.blockInverseDuration = numberMember(object, 'blockInverseDuration')
    this.frameDuration = numberMember(object, 'frameDuration')
    this.blockOffsets = numberArray(object, 'blockOffsets').map((value) => value >>> 0)
    this.data = Uint8Array.from(numberArray(object, 'data'), (value) => value & 0xff)
    assertPap(this.duration > 0 && this.trackCount > 0 && this.frameCount > 1, 'The PAP spline animation metadata is invalid.')
    assertPap(this.blockCount > 0 && this.maxFramesPerBlock > 1 && this.blockOffsets.length >= this.blockCount, 'The PAP spline block table is invalid.')
  }

  sample(timeSeconds: number): Transform[] {
    const frameFloat = Math.min(1, Math.max(0, timeSeconds / this.duration)) * (this.frameCount - 1)
    const frame = Math.floor(frameFloat)
    const delta = frameFloat - frame
    const framesPerBlock = this.maxFramesPerBlock - 1
    const block = Math.min(this.blockCount - 1, Math.max(0, Math.floor(frame / framesPerBlock)))
    const firstFrame = block * framesPerBlock
    const blockTime = (frame - firstFrame + delta) * this.frameDuration
    const quantizedTime = Math.min(255, Math.max(0, Math.floor(blockTime * this.blockInverseDuration * framesPerBlock)))
    const blockOffset = this.blockOffsets[block]!
    const dataOffset = blockOffset + (this.maskAndQuantizationSize & 0x7fffffff)
    const maskOffset = blockOffset
    assertPap(dataOffset < this.data.length && maskOffset < this.data.length, 'The PAP spline block offset is invalid.')
    const data = new ByteReader(this.data.subarray(dataOffset))
    const mask = new ByteReader(this.data.subarray(maskOffset))
    const transforms: Transform[] = []
    for (let track = 0; track < this.trackCount; track += 1) {
      const packedTypes = mask.u8()
      const translationType = packedTypes & 0x03
      const rotationType = (packedTypes >>> 2) & 0x0f
      const scaleType = (packedTypes >>> 6) & 0x03
      const translationMask = mask.u8()
      const translation = translationMask
        ? readNurbsCurve(translationType, data, quantizedTime, this.frameDuration, blockTime, translationMask, [0, 0, 0, 0])
        : [0, 0, 0, 0] as [number, number, number, number]
      data.align(4)
      const rotation = readNurbsQuaternion(rotationType, data, quantizedTime, this.frameDuration, blockTime, mask.u8())
      data.align(4)
      const scaleMask = mask.u8()
      const scale = scaleMask
        ? readNurbsCurve(scaleType, data, quantizedTime, this.frameDuration, blockTime, scaleMask, [1, 1, 1, 1])
        : [1, 1, 1, 1] as [number, number, number, number]
      data.align(4)
      transforms.push({ translation, rotation, scale })
    }
    return transforms
  }
}

function normalizeQuaternion(value: [number, number, number, number]): [number, number, number, number] {
  const length = Math.hypot(...value)
  if (!Number.isFinite(length) || length < 1e-8) return [0, 0, 0, 1]
  return value.map((component) => component / length) as [number, number, number, number]
}

function rankedAnimations(infos: PapAnimationInfo[]): PapAnimationInfo[] {
  const valid = infos.filter((info) => info.havokIndex >= 0)
  assertPap(valid.length > 0, 'The PAP contains no skeletal animation binding.')
  return [...valid].sort((left, right) => {
    const score = (value: string) => {
      const name = value.toLowerCase()
      return Number(name.includes('id0')) * 16
        + Number(name.includes('idle')) * 8
        + Number(name.includes('loop') || name.includes('_lp')) * 4
    }
    return score(right.name) - score(left.name)
  })
}

/** Decodes the preferred loop from an FFXIV idle PAP into browser keyframes. */
export function decodePap(bytes: ArrayBuffer, path = '', sampleRate = 30): DecodedAnimation {
  const pap = parsePapHeader(bytes)
  const objects = decodeHavokTagfile(pap.havokData)
  const container = objects.find((object) => object.type.name === 'hkaAnimationContainer')
  assertPap(container, 'The PAP contains no hkaAnimationContainer.')
  const bindingValues = havokValueArray(havokObjectValue(container, 'bindings'), 'bindings')
  let selected: { info: PapAnimationInfo; binding: HavokObject; blendHint: number } | undefined
  for (const info of rankedAnimations(pap.animations)) {
    const binding = bindingValues[info.havokIndex]
    if (typeof binding !== 'object' || binding === null || Array.isArray(binding) || !('type' in binding)) continue
    const candidate = binding as HavokObject
    const blendHint = numberMember(candidate, 'blendHint')
    selected ??= { info, binding: candidate, blendHint }
    // Standing idle playback must prefer a normal binding. Treating an additive
    // clip as absolute local transforms is the main cause of exploded poses.
    if (blendHint === 0) {
      selected = { info, binding: candidate, blendHint }
      break
    }
  }
  assertPap(selected, 'The PAP contains no usable skeletal animation binding.')
  const { info, binding: bindingObject, blendHint } = selected
  const trackToBone = numberArray(bindingObject, 'transformTrackToBoneIndices')
  const animationObject = objectMember(bindingObject, 'animation')
  assertPap(animationObject.type.name === 'hkaSplineCompressedAnimation', `Unsupported PAP animation type ${animationObject.type.name}.`)
  const animation = new SplineAnimation(animationObject)
  const frameTotal = Math.min(1801, Math.max(2, Math.ceil(animation.duration * sampleRate) + 1))
  const times = Float32Array.from({ length: frameTotal }, (_, frame) => Math.min(animation.duration, frame / sampleRate))
  const tracks = trackToBone.map((boneIndex): DecodedAnimationTrack => ({
    boneIndex,
    translations: new Float32Array(frameTotal * 3),
    rotations: new Float32Array(frameTotal * 4),
    scales: new Float32Array(frameTotal * 3),
  }))
  for (let frame = 0; frame < frameTotal; frame += 1) {
    const transforms = animation.sample(times[frame]!)
    const count = Math.min(transforms.length, tracks.length)
    for (let trackIndex = 0; trackIndex < count; trackIndex += 1) {
      const transform = transforms[trackIndex]!
      const track = tracks[trackIndex]!
      const translationOffset = frame * 3
      const rotationOffset = frame * 4
      track.translations.set(transform.translation.slice(0, 3), translationOffset)
      track.scales.set(transform.scale.slice(0, 3), translationOffset)
      let rotation = normalizeQuaternion(transform.rotation)
      if (frame > 0) {
        const dot = rotation.reduce((sum, value, component) => sum + value * track.rotations[rotationOffset - 4 + component]!, 0)
        if (dot < 0) rotation = rotation.map((value) => -value) as [number, number, number, number]
      }
      track.rotations.set(rotation, rotationOffset)
    }
  }
  return {
    name: info.name,
    path,
    blendHint: blendHint === 0 ? 'normal' : 'additive',
    duration: animation.duration,
    times,
    tracks,
  }
}
