import { describe, expect, it } from 'vitest'
import {
  SAGE_CHARACTER_ACTIVATE_ANIMATION_NAME,
  SAGE_CHARACTER_DEACTIVATE_ANIMATION_NAME,
  SAGE_CHARACTER_TRANSITION_ANIMATION_PATH,
  SAGE_CHARACTER_TRANSITION_SKELETON_PATH,
  SAGE_DRAW_ANIMATION_TIME_SCALE,
  SAGE_IDLE_WEAPON_ANIMATION_NAME,
  SAGE_IDLE_WEAPON_ANIMATION_PATH,
  SAGE_IDLE_WEAPON_SKELETON_PATH,
  SAGE_IDLE_WEAPON_VERTICAL_OFFSET,
  SAGE_IDLE_WEAPON_YAW,
  SAGE_WEAPON_ACTIVATE_ANIMATION_NAME,
  SAGE_WEAPON_DEACTIVATE_ANIMATION_NAME,
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
    expect(SAGE_WEAPON_ACTIVATE_ANIMATION_NAME).toBe('cbbw_activ')
    expect(SAGE_WEAPON_DEACTIVATE_ANIMATION_NAME).toBe('cbbw_deact')
  })

  it('uses the shared Sage character skeleton for draw and sheath transitions', () => {
    expect(SAGE_CHARACTER_TRANSITION_SKELETON_PATH).toBe(
      'chara/human/c0101/skeleton/base/b0001/skl_c0101b0001.sklb',
    )
    expect(SAGE_CHARACTER_TRANSITION_ANIMATION_PATH).toBe(
      'chara/human/c0101/animation/a0001/bt_2ff_emp/resident/sub.pap',
    )
    expect(SAGE_CHARACTER_ACTIVATE_ANIMATION_NAME).toBe('cbbp_a_activ')
    expect(SAGE_CHARACTER_DEACTIVATE_ANIMATION_NAME).toBe('cbbp_a_deact')
    expect(SAGE_DRAW_ANIMATION_TIME_SCALE).toBe(1.25)
  })

  it('lifts and reverses the complete authored formation', () => {
    expect(SAGE_IDLE_WEAPON_VERTICAL_OFFSET).toBe(1.20)
    expect(SAGE_IDLE_WEAPON_YAW).toBe(Math.PI)
  })
})
