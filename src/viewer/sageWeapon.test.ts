import { describe, expect, it } from 'vitest'
import { SAGE_WEAPON_BONE_MAP } from './sageWeapon'

describe('Sage noulith attachment mapping', () => {
  it('uses the back mounts for the upper pair and hip mounts for the lower pair', () => {
    expect(SAGE_WEAPON_BONE_MAP).toEqual({
      n_hara: 'j_buki_sebo_l',
      n_haraB: 'j_buki_sebo_r',
      n_haraC: 'j_buki_kosi_l',
      n_haraD: 'j_buki_kosi_r',
    })
  })
})
