/** Shared articulated skeleton used by the four nouliths during Sage idles. */
export const SAGE_IDLE_WEAPON_SKELETON_PATH = 'chara/weapon/w2702/skeleton/base/b0001/skl_w2702b0001.sklb'

/** Game-authored weapon package and loop paired with the w2702 skeleton. */
export const SAGE_IDLE_WEAPON_ANIMATION_PATH = 'chara/weapon/w2702/animation/a0001/wp_common/resident/weapon.pap'
export const SAGE_IDLE_WEAPON_ANIMATION_NAME = 'cbbw_2fa_2lp'
export const SAGE_WEAPON_ACTIVATE_ANIMATION_NAME = 'cbbw_activ'
export const SAGE_WEAPON_DEACTIVATE_ANIMATION_NAME = 'cbbw_deact'

/** Character transition source authored against the shared Midlander skeleton. */
export const SAGE_CHARACTER_TRANSITION_SKELETON_PATH = 'chara/human/c0101/skeleton/base/b0001/skl_c0101b0001.sklb'
export const SAGE_CHARACTER_TRANSITION_ANIMATION_PATH = 'chara/human/c0101/animation/a0001/bt_2ff_emp/resident/sub.pap'
export const SAGE_CHARACTER_ACTIVATE_ANIMATION_NAME = 'cbbp_a_activ'
export const SAGE_CHARACTER_DEACTIVATE_ANIMATION_NAME = 'cbbp_a_deact'

/** Shortens the Sage draw transition while preserving the authored motion. */
export const SAGE_DRAW_ANIMATION_TIME_SCALE = 1.25

/** Midlander-space lift applied to the complete authored formation. */
export const SAGE_IDLE_WEAPON_VERTICAL_OFFSET = 1.20

/** Turns the complete authored formation so every noulith points the other way. */
export const SAGE_IDLE_WEAPON_YAW = Math.PI
