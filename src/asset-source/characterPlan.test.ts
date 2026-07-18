import { describe, expect, it } from 'vitest'
import type { ArmorItem } from '../catalog/types'
import {
  auxiliarySkeletonPlan,
  CHARACTER_PRESETS,
  characterModelCandidates,
  characterModelPlan,
  equipmentModelCandidates,
  faceSkeletonCandidates,
  faceSkeletonPath,
  hairSkeletonPath,
  idleAnimationCandidates,
  skeletonPath,
} from './characterPlan'

const bodyItem: ArmorItem = {
  id: 1, name: 'Test coat', modelValue: 190, modelSet: 190, modelVariant: 1,
  modelBase: 0,
  slot: 'body', dyeCount: 0, equipLevel: 1, jobs: 'All',
}

describe('character asset planning', () => {
  it('exposes every playable race and gender model code', () => {
    expect(CHARACTER_PRESETS).toHaveLength(18)
    expect(CHARACTER_PRESETS.map(({ code }) => code)).toEqual(
      Array.from({ length: 18 }, (_, index) => `c${((index + 1) * 100 + 1).toString().padStart(4, '0')}`),
    )
  })

  it('builds the base Midlander female model and skeleton paths', () => {
    expect(characterModelPlan('c0201').map((part) => part.path)).toEqual([
      'chara/equipment/e0000/model/c0201e0000_top.mdl',
      'chara/equipment/e0000/model/c0201e0000_glv.mdl',
      'chara/equipment/e0000/model/c0201e0000_dwn.mdl',
      'chara/equipment/e0000/model/c0201e0000_sho.mdl',
      'chara/human/c0201/obj/face/f0001/model/c0201f0001_fac.mdl',
      'chara/human/c0201/obj/hair/h0001/model/c0201h0001_hir.mdl',
    ])
    expect(skeletonPath('c0201')).toBe('chara/human/c0201/skeleton/base/b0001/skl_c0201b0001.sklb')
    expect(faceSkeletonPath('c0201')).toBe('chara/human/c0201/skeleton/face/f0002/skl_c0201f0002.sklb')
    expect(hairSkeletonPath('c0201', 1)).toBe('chara/human/c0201/skeleton/hair/h0001/skl_c0201h0001.sklb')
    expect(idleAnimationCandidates('c0201')).toEqual([
      'chara/human/c0201/animation/a0001/bt_common/resident/idle.pap',
      'chara/human/c0101/animation/a0001/bt_common/resident/idle.pap',
    ])
  })

  it('prefers the weapon idle then falls back to the unarmed idle', () => {
    expect(idleAnimationCandidates('c0201', 'bt_dgr_dgr')).toEqual([
      'chara/human/c0201/animation/a0001/bt_dgr_dgr/resident/idle.pap',
      'chara/human/c0101/animation/a0001/bt_dgr_dgr/resident/idle.pap',
      'chara/human/c0201/animation/a0001/bt_common/resident/idle.pap',
      'chara/human/c0101/animation/a0001/bt_common/resident/idle.pap',
    ])
  })

  it('adds the male Midlander equipment fallback', () => {
    expect(equipmentModelCandidates(bodyItem, 'c0901')).toEqual([
      'chara/equipment/e0190/model/c0901e0190_top.mdl',
      'chara/equipment/e0190/model/c0101e0190_top.mdl',
    ])
  })

  it('falls back to shared c0101 geometry when a female model is absent', () => {
    const workboots = { ...bodyItem, name: 'Weathered Workboots', modelSet: 6, slot: 'feet' as const }
    expect(equipmentModelCandidates(workboots, 'c0201')).toEqual([
      'chara/equipment/e0006/model/c0201e0006_sho.mdl',
      'chara/equipment/e0006/model/c0101e0006_sho.mdl',
    ])
  })

  it('adds race-specific default tails, ears, and their auxiliary skeletons', () => {
    expect(characterModelPlan('c0701').at(-1)).toEqual({
      part: 'tail',
      path: 'chara/human/c0701/obj/tail/t0001/model/c0701t0001_til.mdl',
      optional: true,
    })
    expect(auxiliarySkeletonPlan('c0701')).toEqual([{
      part: 'tail',
      path: 'chara/human/c0701/skeleton/tail/t0001/skl_c0701t0001.sklb',
      attachmentBone: 'j_kosi',
    }])
    expect(characterModelPlan('c1801').at(-1)).toEqual({
      part: 'ears',
      path: 'chara/human/c1801/obj/zear/z0001/model/c1801z0001_zer.mdl',
      optional: true,
    })
  })

  it('uses compatible body families before the universal fallback', () => {
    expect(equipmentModelCandidates(bodyItem, 'c1601')).toEqual([
      'chara/equipment/e0190/model/c1601e0190_top.mdl',
      'chara/equipment/e0190/model/c1001e0190_top.mdl',
      'chara/equipment/e0190/model/c0201e0190_top.mdl',
      'chara/equipment/e0190/model/c0101e0190_top.mdl',
    ])
  })

  it('uses shared body geometry when a race-specific naked model is absent', () => {
    const [miqoteTorso] = characterModelPlan('c0701')
    expect(characterModelCandidates(miqoteTorso!)).toEqual([
      'chara/equipment/e0000/model/c0701e0000_top.mdl',
      'chara/equipment/e0000/model/c0101e0000_top.mdl',
    ])

    const [vieraFemaleTorso] = characterModelPlan('c1801')
    expect(characterModelCandidates(vieraFemaleTorso!)).toEqual([
      'chara/equipment/e0000/model/c1801e0000_top.mdl',
      'chara/equipment/e0000/model/c0201e0000_top.mdl',
      'chara/equipment/e0000/model/c0101e0000_top.mdl',
    ])
  })

  it('tries alternate race face models and race-aware face skeletons', () => {
    const highlanderFace = characterModelPlan('c0301').find(({ part }) => part === 'face')!
    expect(characterModelCandidates(highlanderFace)).toEqual([
      'chara/human/c0301/obj/face/f0001/model/c0301f0001_fac.mdl',
      'chara/human/c0301/obj/face/f0101/model/c0301f0101_fac.mdl',
    ])
    expect(faceSkeletonCandidates('c0501')).toEqual([
      'chara/human/c0501/skeleton/face/f0001/skl_c0501f0001.sklb',
      'chara/human/c0501/skeleton/face/f0002/skl_c0501f0002.sklb',
      'chara/human/c0501/skeleton/face/f0101/skl_c0501f0101.sklb',
    ])
  })
})
