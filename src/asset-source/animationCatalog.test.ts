import { describe, expect, it } from 'vitest'
import { idleAnimationCandidates } from './characterPlan'
import {
  catalogAnimationCandidates,
  parseAnimationId,
  toCatalogAnimation,
  weaponClassLabel,
} from './animationCatalog'

describe('animation catalog id parsing', () => {
  it('splits a single-clip file with no internal track', () => {
    expect(parseAnimationId('bt_common-resident-idle')).toEqual({
      weaponClass: 'bt_common',
      sub: 'resident',
      papFile: 'idle',
      internal: '',
    })
  })

  it('keeps an internal track name for multi-clip files', () => {
    expect(parseAnimationId('bt_2ax_emp-resident-move_b-cbbm_01l_lp0')).toEqual({
      weaponClass: 'bt_2ax_emp',
      sub: 'resident',
      papFile: 'move_b',
      internal: 'cbbm_01l_lp0',
    })
  })

  it('joins internal tracks that themselves contain dashes', () => {
    expect(parseAnimationId('bt_common-ability-pvp_common-abl023-x').internal).toBe('abl023-x')
  })
})

describe('animation catalog categorisation', () => {
  const category = (id: string) => toCatalogAnimation(id).category

  it('routes resident files to idle, movement and stances', () => {
    expect(category('bt_common-resident-idle')).toBe('idle')
    expect(category('bt_2ax_emp-resident-move_a-cbbm_01f_lp0')).toBe('movement')
    expect(category('bt_2ax_emp-resident-sub-cbbm_grd')).toBe('stances')
  })

  it('routes emote, craft, gather, music and combat subs', () => {
    expect(category('bt_2ax_emp-emote-battle03')).toBe('emotes')
    expect(category('bt_alc_emp-craft-start')).toBe('crafting')
    expect(category('bt_min_emp-gather-cbnm_id0')).toBe('gathering')
    expect(category('bt_2ax_emp-music-perform01')).toBe('performance')
    expect(category('bt_common-ability-2ax_warrior-abl001')).toBe('combat')
    expect(category('bt_2ax_emp-ws-bt_2ax_emp-ws_s09')).toBe('combat')
  })

  it('builds a human-facing motion label from the internal track', () => {
    expect(toCatalogAnimation('bt_2ax_emp-resident-move_b-cbbm_01l_lp0').label).toBe('cbbm 01l lp0')
    expect(toCatalogAnimation('bt_common-resident-idle').label).toBe('idle')
  })
})

describe('animation catalog path resolution', () => {
  it('resolves the idle entry to the same paths as the dedicated idle helper', () => {
    const entry = toCatalogAnimation('bt_common-resident-idle')
    expect(catalogAnimationCandidates(entry, 'c0201')).toEqual(idleAnimationCandidates('c0201'))
  })

  it('substitutes the weapon class, sub and file into the race-fallback paths', () => {
    const entry = toCatalogAnimation('bt_2ax_emp-resident-move_b-cbbm_01l_lp0')
    expect(catalogAnimationCandidates(entry, 'c1801')).toEqual([
      'chara/human/c1801/animation/a0001/bt_2ax_emp/resident/move_b.pap',
      'chara/human/c0201/animation/a0001/bt_2ax_emp/resident/move_b.pap',
      'chara/human/c0101/animation/a0001/bt_2ax_emp/resident/move_b.pap',
    ])
  })
})

describe('weapon class labels', () => {
  it('labels known classes and falls back to the raw code', () => {
    expect(weaponClassLabel('bt_common')).toBe('Common (no weapon)')
    expect(weaponClassLabel('bt_2kt_emp')).toBe('Katana')
    expect(weaponClassLabel('bt_zzz_zzz')).toBe('bt_zzz_zzz')
  })
})
