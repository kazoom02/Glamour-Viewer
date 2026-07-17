// Havok binary tagfile parsing follows the MIT-licensed FFXIVTools implementation
// by Inseok Lee, as independently ported through Physis' attributed source.

export interface DecodedSkeletonBone {
  name: string
  parentIndex: number
  translation: [number, number, number]
  rotation: [number, number, number, number]
  scale: [number, number, number]
  isAuxiliary?: boolean
}

export interface DecodedSkeleton {
  bones: DecodedSkeletonBone[]
}

/** Attaches an auxiliary face/hair skeleton while reusing duplicate parent bones. */
export function attachSkeleton(
  base: DecodedSkeleton,
  auxiliary: DecodedSkeleton,
  attachmentBone: string,
): DecodedSkeleton {
  const bones = base.bones.map((bone) => ({ ...bone }))
  const byName = new Map(bones.map((bone, index) => [bone.name, index]))
  const attachmentIndex = byName.get(attachmentBone)
  if (attachmentIndex === undefined) throw new Error(`The base skeleton has no ${attachmentBone} attachment bone.`)
  const remap: number[] = []

  auxiliary.bones.forEach((bone, index) => {
    const existing = byName.get(bone.name)
    if (existing !== undefined) {
      remap[index] = existing
      return
    }
    const parentIndex = bone.parentIndex >= 0
      ? remap[bone.parentIndex] ?? attachmentIndex
      : attachmentIndex
    remap[index] = bones.length
    byName.set(bone.name, bones.length)
    bones.push({ ...bone, parentIndex, isAuxiliary: true })
  })
  return { bones }
}

export interface HavokMember {
  name: string
  type: number
  className?: string
}

export interface HavokType {
  name: string
  parent?: HavokType
  ownMembers: HavokMember[]
}

export interface HavokObject {
  type: HavokType
  values: Map<number, HavokValue>
}

export interface ObjectReference { reference: number }
export type HavokValue = number | string | number[] | HavokValue[] | HavokObject | ObjectReference

const BASE_MASK = 0x0f
const ARRAY = 0x10
const TUPLE = 0x20
const BYTE = 1
const INT = 2
const REAL = 3
const VEC4 = 4
const VEC16 = 7
const OBJECT = 8
const STRUCT = 9
const STRING = 10

function assertSklb(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

class Reader {
  private readonly view: DataView
  cursor = 0

  constructor(bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  }

  get remaining() { return this.view.byteLength - this.cursor }

  u8(): number {
    assertSklb(this.remaining >= 1, 'The Havok tagfile is truncated.')
    return this.view.getUint8(this.cursor++)
  }

  u32(): number {
    assertSklb(this.remaining >= 4, 'The Havok tagfile is truncated.')
    const value = this.view.getUint32(this.cursor, true)
    this.cursor += 4
    return value
  }

  f32(): number {
    assertSklb(this.remaining >= 4, 'The Havok tagfile is truncated.')
    const value = this.view.getFloat32(this.cursor, true)
    this.cursor += 4
    return value
  }

  bytes(length: number): Uint8Array {
    assertSklb(length >= 0 && length <= this.remaining, 'A Havok value extends beyond the tagfile.')
    const value = new Uint8Array(this.view.buffer, this.view.byteOffset + this.cursor, length)
    this.cursor += length
    return value
  }
}

class TagfileReader {
  private readonly reader: Reader
  private fileVersion = 0
  private readonly strings = ['string', '']
  private readonly types: HavokType[] = [{ name: 'object', ownMembers: [] }]
  private readonly remembered: HavokObject[] = []
  private readonly objects: HavokObject[] = []

  constructor(bytes: Uint8Array) {
    this.reader = new Reader(bytes)
  }

  read(): HavokObject[] {
    assertSklb(this.reader.u32() === 0xcab00d1e && this.reader.u32() === 0xd011face, 'The SKLB Havok signature is invalid.')
    while (this.reader.remaining > 0) {
      const tag = this.packedInt()
      if (tag === 1) {
        this.fileVersion = this.packedInt()
        assertSklb(this.fileVersion === 3, `Unsupported Havok tagfile version ${this.fileVersion}.`)
        this.remembered.push({ type: this.types[0]!, values: new Map() })
      } else if (tag === 2) {
        this.types.push(this.readType())
      } else if (tag === 4) {
        const object = this.readObject()
        this.remembered.push(object)
        this.objects.push(object)
      } else if (tag === 7 || tag === -1) {
        break
      } else {
        throw new Error(`Unsupported Havok tag ${tag}.`)
      }
    }
    this.resolveReferences()
    return this.objects
  }

  private members(type: HavokType): HavokMember[] {
    return [...(type.parent ? this.members(type.parent) : []), ...type.ownMembers]
  }

  private readType(): HavokType {
    const name = this.string()
    this.packedInt() // type version
    const parentIndex = this.packedInt()
    const memberCount = this.packedInt()
    assertSklb(parentIndex >= 0 && parentIndex < this.types.length, 'A Havok type has an invalid parent.')
    const ownMembers = Array.from({ length: memberCount }, (): HavokMember => {
      const memberName = this.string()
      const type = this.packedInt()
      if (type & TUPLE) this.packedInt()
      const base = type & BASE_MASK
      const className = base === OBJECT || base === STRUCT ? this.string() : undefined
      return { name: memberName, type, className }
    })
    return { name, parent: this.types[parentIndex], ownMembers }
  }

  private readObject(): HavokObject {
    const typeIndex = this.packedInt()
    const type = this.types[typeIndex]
    assertSklb(type, `A Havok object references unknown type ${typeIndex}.`)
    const members = this.members(type)
    const exists = this.bitField(members.length)
    const values = new Map<number, HavokValue>()
    members.forEach((member, index) => values.set(index, exists[index] ? this.value(member) : this.defaultValue(member.type)))
    return { type, values }
  }

  private value(member: HavokMember): HavokValue {
    if (member.type & ARRAY) {
      const length = this.packedInt()
      assertSklb(length >= 0 && length <= 100_000, 'A Havok array length is invalid.')
      return this.array(member, length)
    }
    const base = member.type & BASE_MASK
    if (base === BYTE) return this.reader.u8()
    if (base === INT) return this.packedInt()
    if (base === REAL) return this.reader.f32()
    if (base === STRING) return this.string()
    if (base === OBJECT) return { reference: this.packedInt() }
    if (base === STRUCT) return this.struct(member)
    if (base >= VEC4 && base <= VEC16) return Array.from({ length: base - VEC4 + 1 << 2 }, () => this.reader.f32())
    throw new Error(`Unsupported Havok value type 0x${member.type.toString(16)}.`)
  }

  private struct(member: HavokMember): HavokObject {
    const type = this.findType(member.className)
    const members = this.members(type)
    const exists = this.bitField(members.length)
    const object: HavokObject = { type, values: new Map() }
    this.objects.push(object)
    members.forEach((item, index) => {
      if (exists[index]) object.values.set(index, this.value(item))
      else object.values.set(index, this.defaultValue(item.type))
    })
    return object
  }

  private array(member: HavokMember, length: number): HavokValue[] {
    const base = member.type & BASE_MASK
    if (base === STRING) return Array.from({ length }, () => this.string())
    if (base === OBJECT) return Array.from({ length }, () => ({ reference: this.packedInt() }))
    if (base === BYTE) return Array.from({ length }, () => this.reader.u8())
    if (base === INT) {
      if (this.fileVersion >= 3) this.packedInt()
      return Array.from({ length }, () => this.packedInt())
    }
    if (base === REAL) return Array.from({ length }, () => this.reader.f32())
    if (base >= VEC4 && base <= VEC16) {
      const size = (base - VEC4 + 1) * 4
      return Array.from({ length }, () => Array.from({ length: size }, () => this.reader.f32()))
    }
    if (base === STRUCT) {
      const type = this.findType(member.className)
      const members = this.members(type)
      const exists = this.bitField(members.length)
      const result = Array.from({ length }, (): HavokObject => ({ type, values: new Map() }))
      this.objects.push(...result)
      members.forEach((item, memberIndex) => {
        const values = exists[memberIndex]
          ? this.array({ ...item, type: item.type | ARRAY }, length)
          : Array.from({ length }, () => this.defaultValue(item.type))
        result.forEach((object, index) => object.values.set(memberIndex, values[index]!))
      })
      return result
    }
    throw new Error(`Unsupported Havok array type 0x${member.type.toString(16)}.`)
  }

  private defaultValue(type: number): HavokValue {
    const base = type & BASE_MASK
    if (type & (ARRAY | TUPLE)) return []
    if (base >= VEC4 && base <= VEC16) return Array((base - VEC4 + 1) * 4).fill(0) as number[]
    if (base === STRING) return ''
    if (base === OBJECT) return { reference: 0 }
    return 0
  }

  private string(): string {
    const length = this.packedInt()
    if (length < 0) {
      const value = this.strings[-length]
      assertSklb(value !== undefined, 'A Havok string backreference is invalid.')
      return value
    }
    const value = new TextDecoder().decode(this.reader.bytes(length))
    this.strings.push(value)
    return value
  }

  private bitField(count: number): boolean[] {
    const bytes = this.reader.bytes(Math.ceil(count / 8))
    return Array.from({ length: count }, (_, index) => (bytes[index >>> 3]! & (1 << (index & 7))) !== 0)
  }

  private packedInt(): number {
    let byte = this.reader.u8()
    const negative = (byte & 1) !== 0
    let result = (byte & 0x7f) >>> 1
    let shift = 6
    while (byte & 0x80) {
      byte = this.reader.u8()
      result |= (byte & 0x7f) << shift
      shift += 7
      assertSklb(shift <= 34, 'A Havok packed integer is too large.')
    }
    return negative ? -result : result
  }

  private findType(name?: string): HavokType {
    const type = this.types.find((candidate) => candidate.name === name)
    assertSklb(type, `The Havok type ${name ?? '(missing)'} is unavailable.`)
    return type
  }

  private resolveReferences() {
    const resolve = (value: HavokValue): HavokValue => {
      if (typeof value === 'object' && value !== null && 'reference' in value) {
        const target = this.remembered[value.reference]
        assertSklb(target, `A Havok object reference ${value.reference} is invalid.`)
        return target
      }
      if (Array.isArray(value)) return value.map(resolve)
      return value
    }
    for (const object of this.objects) {
      for (const [key, value] of object.values) object.values.set(key, resolve(value))
    }
  }
}

export function havokObjectValue(object: HavokObject, name: string): HavokValue {
  const members = (type: HavokType): HavokMember[] => [...(type.parent ? members(type.parent) : []), ...type.ownMembers]
  const index = members(object.type).findIndex((member) => member.name === name)
  const value = object.values.get(index)
  assertSklb(index >= 0 && value !== undefined, `The Havok ${object.type.name} object has no ${name} value.`)
  return value
}

export function havokValueArray(value: HavokValue, label: string): HavokValue[] {
  assertSklb(Array.isArray(value), `The Havok ${label} value is not an array.`)
  return value
}

/** Decodes the base hkaSkeleton and its bind-pose transforms from an FFXIV SKLB file. */
export function decodeSklb(bytes: ArrayBuffer): DecodedSkeleton {
  assertSklb(bytes.byteLength >= 16, 'The SKLB header is truncated.')
  const view = new DataView(bytes)
  assertSklb(view.getUint32(0, true) === 0x736b6c62, 'The SKLB magic is invalid.')
  const version = view.getUint32(4, true)
  const oldHeader = [0x31313030, 0x31313130, 0x31323030].includes(version)
  assertSklb(oldHeader || version === 0x31333030 || version === 0x31333031, `Unsupported SKLB version 0x${version.toString(16)}.`)
  const havokOffset = oldHeader ? view.getUint16(10, true) : view.getUint32(12, true)
  assertSklb(havokOffset >= 12 && havokOffset + 8 <= bytes.byteLength, 'The SKLB Havok offset is invalid.')
  const objects = decodeHavokTagfile(new Uint8Array(bytes, havokOffset))
  const skeleton = objects.find((object) => object.type.name === 'hkaSkeleton')
  assertSklb(skeleton, 'The SKLB contains no hkaSkeleton object.')
  const boneValues = havokValueArray(havokObjectValue(skeleton, 'bones'), 'bones')
  const parents = havokValueArray(havokObjectValue(skeleton, 'parentIndices'), 'parentIndices')
  const poses = havokValueArray(havokObjectValue(skeleton, 'referencePose'), 'referencePose')
  assertSklb(boneValues.length > 0 && parents.length >= boneValues.length && poses.length >= boneValues.length, 'The SKLB skeleton arrays have inconsistent lengths.')
  const bones = boneValues.map((value, index): DecodedSkeletonBone => {
    assertSklb(typeof value === 'object' && !Array.isArray(value) && value !== null && 'type' in value, 'An SKLB bone is malformed.')
    const name = havokObjectValue(value as HavokObject, 'name')
    const pose = poses[index]
    assertSklb(typeof name === 'string' && Array.isArray(pose) && pose.length >= 12, 'An SKLB bone pose is malformed.')
    return {
      name,
      parentIndex: Number(parents[index]),
      translation: [Number(pose[0]), Number(pose[1]), Number(pose[2])],
      rotation: [Number(pose[4]), Number(pose[5]), Number(pose[6]), Number(pose[7])],
      scale: [Number(pose[8]), Number(pose[9]), Number(pose[10])],
    }
  })
  return { bones }
}

/** Reads the Havok binary tagfile shared by SKLB skeletons and PAP animations. */
export function decodeHavokTagfile(bytes: Uint8Array): HavokObject[] {
  return new TagfileReader(bytes).read()
}
