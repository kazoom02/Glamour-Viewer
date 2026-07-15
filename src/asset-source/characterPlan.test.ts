import { describe, expect, it } from 'vitest'
import type { ArmorItem } from '../catalog/types'
import { characterModelPlan, equipmentModelCandidates, faceSkeletonPath, hairSkeletonPath, skeletonPath } from './characterPlan'

const bodyItem: ArmorItem = {
  id: 1, name: 'Test coat', modelValue: 190, modelSet: 190, modelVariant: 1,
  slot: 'body', dyeCount: 0, equipLevel: 1, jobs: 'All',
}

describe('character asset planning', () => {
  it('builds the base Midlander female model and skeleton paths', () => {
    expect(characterModelPlan('c0201').map((part) => part.path)).toEqual([
      'chara/equipment/e0000/model/c0201e0000_top.mdl',
      'chara/equipment/e0000/model/c0201e0000_glv.mdl',
      'chara/equipment/e0000/model/c0201e0000_dwn.mdl',
      'chara/equipment/e0000/model/c0201e0000_sho.mdl',
      'chara/human/c0201/obj/face/f0001/model/c0201f0001_fac.mdl',
      'chara/human/c0201/obj/face/f0001/model/c0201f0001_iri.mdl',
      'chara/human/c0201/obj/hair/h0001/model/c0201h0001_hir.mdl',
    ])
    expect(skeletonPath('c0201')).toBe('chara/human/c0201/skeleton/base/b0001/skl_c0201b0001.sklb')
    expect(faceSkeletonPath('c0201')).toBe('chara/human/c0201/skeleton/face/f0002/skl_c0201f0002.sklb')
    expect(hairSkeletonPath('c0201')).toBe('chara/human/c0201/skeleton/hair/h0001/skl_c0201h0001.sklb')
  })

  it('adds the male Midlander equipment fallback', () => {
    expect(equipmentModelCandidates(bodyItem, 'c0901')).toEqual([
      'chara/equipment/e0190/model/c0901e0190_top.mdl',
      'chara/equipment/e0190/model/c0101e0190_top.mdl',
    ])
  })
})
