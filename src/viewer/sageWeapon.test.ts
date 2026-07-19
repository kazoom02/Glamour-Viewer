import { describe, expect, it } from 'vitest'
import {
  SAGE_IDLE_WEAPON_ANIMATION_NAME,
  SAGE_IDLE_WEAPON_ANIMATION_PATH,
  SAGE_IDLE_WEAPON_SKELETON_PATH,
  SAGE_IDLE_WEAPON_VERTICAL_OFFSET,
} from './sageWeapon'

describe('Sage noulith attachment mapping', () => {
  it('uses the shared w2702 noulith idle skeleton', () => {
    expect(SAGE_IDLE_WEAPON_SKELETON_PATH).toBe(
      'chara/weapon/w2702/skeleton/base/b0001/skl_w2702b0001.sklb',
    )
  })

  it('uses the authored cbbw_2fa_2lp loop from the weapon package', () => {
    expect(SAGE_IDLE_WEAPON_ANIMATION_PATH).toBe(
      'chara/weapon/w2702/animation/a0001/wp_common/resident/weapon.pap',
    )
    expect(SAGE_IDLE_WEAPON_ANIMATION_NAME).toBe('cbbw_2fa_2lp')
  })

  it('lifts the drawn formation above the character head', () => {
    expect(SAGE_IDLE_WEAPON_VERTICAL_OFFSET).toBe(0.12)
  })
})
