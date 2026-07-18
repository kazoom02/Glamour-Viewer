import { describe, expect, it } from 'vitest'
import { remapSkinIndices } from './skinBinding'

describe('model skin binding', () => {
  const rig = new Map([
    ['n_root', 0],
    ['j_kao', 7],
    ['j_kami_a', 12],
  ])

  it('maps authored model bones to their combined-rig indices', () => {
    const result = remapSkinIndices(
      new Uint16Array([0, 1, 2, 0]),
      ['n_root', 'j_kao', 'j_kami_a'],
      rig,
      'j_kao',
    )
    expect(Array.from(result.indices)).toEqual([0, 7, 12, 0])
    expect(result.missingBoneNames).toEqual([])
  })

  it('anchors unresolved hair influences to the head instead of the world root', () => {
    const result = remapSkinIndices(
      new Uint16Array([0, 1, 1, 0]),
      ['n_root', 'j_kami_missing'],
      rig,
      'j_kao',
    )
    expect(Array.from(result.indices)).toEqual([0, 7, 7, 0])
    expect(result.missingBoneNames).toEqual(['j_kami_missing'])
  })
})
