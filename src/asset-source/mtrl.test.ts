import { describe, expect, it } from 'vitest'
import { materialTexturePriority, parseMtrl, type MaterialTextureReference } from './mtrl'

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

  it('reads Dawntrail color and dye tables', () => {
    const strings = new TextEncoder().encode('character.shpk\0')
    const stringStart = 16
    const additionalDataSize = 4
    const dataSetSize = 32 * 64 + 32 * 4
    const dataStart = stringStart + strings.length + additionalDataSize
    const shaderStart = dataStart + dataSetSize
    const bytes = new Uint8Array(shaderStart + 12)
    const view = new DataView(bytes.buffer)
    view.setUint32(0, 0x01030000, true)
    view.setUint16(4, bytes.length, true)
    view.setUint16(6, dataSetSize, true)
    view.setUint16(8, strings.length, true)
    bytes[15] = additionalDataSize
    bytes.set(strings, stringStart)
    view.setUint32(stringStart + strings.length, 0x53c, true)
    view.setUint16(dataStart, 0x3c00, true)
    view.setUint16(dataStart + 2, 0x3800, true)
    view.setUint16(dataStart + 4, 0x3400, true)
    view.setUint16(dataStart + 32, 0x3800, true)
    view.setUint16(dataStart + 36, 0x3400, true)
    view.setUint32(dataStart + 32 * 64, (1 << 27) | (12 << 16) | 0x21, true)

    const material = parseMtrl(bytes.buffer)
    expect(material.colorTable?.kind).toBe('dawntrail')
    expect(material.colorTable?.rows).toHaveLength(32)
    expect(material.colorTable?.rows[0]).toMatchObject({
      diffuse: [1, 0.5, 0.25],
      specularMask: 1,
      roughness: 0.5,
      metalness: 0.25,
    })
    expect(material.dyeTable?.[0]).toEqual({ template: 12, channel: 1, flags: 0x21 })
  })

  it('prioritizes canonical character samplers over generic diffuse aliases', () => {
    const generic: MaterialTextureReference = {
      path: 'chara/common/texture/tile.tex', flags: 0, samplerId: 0x88408c04, role: 'diffuse',
    }
    const canonical: MaterialTextureReference = {
      path: 'chara/equipment/e0005/texture/c0201e0005_sho_d.tex',
      flags: 0,
      samplerId: 0x115306be,
      role: 'diffuse',
    }
    expect(materialTexturePriority(canonical)).toBeGreaterThan(materialTexturePriority(generic))
  })
})
