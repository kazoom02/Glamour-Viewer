import { describe, expect, it } from 'vitest'
import { SAGE_WEAPON_FORMATION } from './sageWeapon'

describe('Sage noulith attachment mapping', () => {
  it('uses the back mounts for the upper pair and hip mounts for the lower pair', () => {
    expect(SAGE_WEAPON_FORMATION).toEqual({
      n_hara: { characterBone: 'j_buki_sebo_l', offset: [0.62, 0.9, 0.28] },
      n_haraB: { characterBone: 'j_buki_sebo_r', offset: [-0.62, 0.9, 0.28] },
      n_haraC: { characterBone: 'j_buki_kosi_l', offset: [0.68, 0.6, 0.28] },
      n_haraD: { characterBone: 'j_buki_kosi_r', offset: [-0.68, 0.6, 0.28] },
    })
  })
})
