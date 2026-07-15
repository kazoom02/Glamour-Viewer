import { describe, expect, it } from 'vitest'
import { attachSkeleton, decodeSklb } from './sklb'

function packed(value: number): number[] {
  const negative = value < 0
  let remaining = Math.abs(value)
  const result: number[] = []
  let first = ((remaining & 0x3f) << 1) | (negative ? 1 : 0)
  remaining >>>= 6
  if (remaining) first |= 0x80
  result.push(first)
  while (remaining) {
    let byte = remaining & 0x7f
    remaining >>>= 7
    if (remaining) byte |= 0x80
    result.push(byte)
  }
  return result
}

function string(value: string): number[] {
  const bytes = Array.from(new TextEncoder().encode(value))
  return [...packed(bytes.length), ...bytes]
}

function float(value: number): number[] {
  const bytes = new Uint8Array(4)
  new DataView(bytes.buffer).setFloat32(0, value, true)
  return Array.from(bytes)
}

function uint32(value: number): number[] {
  const bytes = new Uint8Array(4)
  new DataView(bytes.buffer).setUint32(0, value, true)
  return Array.from(bytes)
}

function skeletonFixture(): ArrayBuffer {
  const tagfile = [
    ...uint32(0xcab00d1e), ...uint32(0xd011face),
    ...packed(1), ...packed(3),
    // hkaBone { name: string }
    ...packed(2), ...string('hkaBone'), ...packed(0), ...packed(0), ...packed(1),
    ...string('name'), ...packed(10),
    // hkaSkeleton { bones, parentIndices, referencePose }
    ...packed(2), ...string('hkaSkeleton'), ...packed(0), ...packed(0), ...packed(3),
    ...string('bones'), ...packed(0x19), ...string('hkaBone'),
    ...string('parentIndices'), ...packed(0x12),
    ...string('referencePose'), ...packed(0x16),
    // Remember one hkaSkeleton object. All fields are present.
    ...packed(4), ...packed(2), 0b111,
    // bones: struct-of-arrays, both names present
    ...packed(2), 0b1, ...string('root'), ...string('child'),
    // parent indices (the leading value is Havok's packed integer array type marker)
    ...packed(2), ...packed(0), ...packed(-1), ...packed(0),
    // reference poses
    ...packed(2),
    ...[0, 0, 0, 1, 0, 0, 0, 1, 1, 1, 1, 0].flatMap(float),
    ...[0, 1, 0, 1, 0, 0, 0, 1, 1, 1, 1, 0].flatMap(float),
    ...packed(7),
  ]
  const header = [...uint32(0x736b6c62), ...uint32(0x31333030), ...uint32(0), ...uint32(16)]
  return Uint8Array.from([...header, ...tagfile]).buffer
}

describe('SKLB decoder', () => {
  it('attaches auxiliary face bones without duplicating the shared head bone', () => {
    const pose = {
      translation: [0, 0, 0] as [number, number, number],
      rotation: [0, 0, 0, 1] as [number, number, number, number],
      scale: [1, 1, 1] as [number, number, number],
    }
    const merged = attachSkeleton({ bones: [
      { name: 'n_root', parentIndex: -1, ...pose },
      { name: 'j_kao', parentIndex: 0, ...pose },
    ] }, { bones: [
      { name: 'j_kao', parentIndex: -1, ...pose },
      { name: 'j_f_eye_l', parentIndex: 0, ...pose },
    ] }, 'j_kao')
    expect(merged.bones.map((bone) => [bone.name, bone.parentIndex])).toEqual([
      ['n_root', -1], ['j_kao', 0], ['j_f_eye_l', 1],
    ])
  })

  it('extracts bone hierarchy and bind transforms from a Havok tagfile', () => {
    expect(decodeSklb(skeletonFixture())).toEqual({
      bones: [
        {
          name: 'root', parentIndex: -1,
          translation: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1],
        },
        {
          name: 'child', parentIndex: 0,
          translation: [0, 1, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1],
        },
      ],
    })
  })
})
