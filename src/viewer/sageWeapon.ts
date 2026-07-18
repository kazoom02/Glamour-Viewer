export interface SageWeaponFormationPart {
  characterBone: string
  /** Character-local offset as a fraction of pelvis-to-head length. */
  offset: readonly [lateral: number, vertical: number, forward: number]
}

/**
 * The PAP supplies the per-frame hover/rotation at compact equipment mounts.
 * The game then spreads the articulated weapon into its drawn combat formation.
 * Scale these offsets by the current character's torso rather than using fixed
 * Midlander-sized metres so Lalafell and Roegadyn retain the same proportions.
 */
export const SAGE_WEAPON_FORMATION: Record<string, SageWeaponFormationPart> = {
  n_hara: { characterBone: 'j_buki_sebo_l', offset: [0.62, 0.9, 0.28] },
  n_haraB: { characterBone: 'j_buki_sebo_r', offset: [-0.62, 0.9, 0.28] },
  n_haraC: { characterBone: 'j_buki_kosi_l', offset: [0.68, 0.6, 0.28] },
  n_haraD: { characterBone: 'j_buki_kosi_r', offset: [-0.68, 0.6, 0.28] },
} as const
