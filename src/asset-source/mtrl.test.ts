import { describe, expect, it } from 'vitest'
import { parseMtrl } from './mtrl'

describe('MTRL parser', () => {
  it('resolves texture strings and sampler roles', () => {
    const strings = new TextEncoder().encode('chara/test_d.tex\0character.shpk\0')
    const stringStart = 20
    const shaderStart = stringStart + strings.length
    const bytes = new Uint8Array(shaderStart + 12 + 12)
    const view = new DataView(bytes.buffer)
    view.setUint32(0, 0x01030000, true)
    view.setUint16(4, bytes.length, true)
    view.setUint16(8, strings.length, true)
    view.setUint16(10, 'chara/test_d.tex\0'.length, true)
    bytes[12] = 1
    view.setUint16(16, 0, true)
    view.setUint16(18, 9, true)
    bytes.set(strings, stringStart)
    view.setUint16(shaderStart + 6, 1, true)
    view.setUint32(shaderStart + 12, 0x115306be, true)
    bytes[shaderStart + 20] = 0

    expect(parseMtrl(bytes.buffer)).toEqual({
      version: 0x01030000,
      shaderPackage: 'character.shpk',
      textures: [{ path: 'chara/test_d.tex', flags: 9, samplerId: 0x115306be, role: 'diffuse' }],
    })
  })
})

