import { describe, expect, it } from 'vitest'
import { materialCandidates } from './materialPath'

describe('MDL material path resolution', () => {
  it('resolves a shared body material referenced by equipment geometry', () => {
    expect(materialCandidates({
      modelPath: 'chara/equipment/e6269/model/c0201e6269_top.mdl',
      materialPaths: [],
    }, '/mt_c0201b0001_a.mtrl', 3)).toEqual([
      'chara/human/c0201/obj/body/b0001/material/v0001/mt_c0201b0001_a.mtrl',
      'chara/human/c0201/obj/body/b0001/material/mt_c0201b0001_a.mtrl',
      'chara/equipment/e6269/material/v0003/mt_c0201b0001_a.mtrl',
    ])
  })

  it('uses the IMC material variant for an equipment material', () => {
    expect(materialCandidates({
      modelPath: 'chara/equipment/e6269/model/c0201e6269_top.mdl',
      materialPaths: [],
    }, '/mt_c0201e6269_top_a.mtrl', 3)[0]).toBe(
      'chara/equipment/e6269/material/v0003/mt_c0201e6269_top_a.mtrl',
    )
  })

  it('resolves face and hair object materials', () => {
    expect(materialCandidates({
      modelPath: 'chara/human/c0201/obj/face/f0001/model/c0201f0001_fac.mdl',
      materialPaths: [],
    }, '/mt_c0201f0001_fac_a.mtrl', 1)[0]).toBe(
      'chara/human/c0201/obj/face/f0001/material/v0001/mt_c0201f0001_fac_a.mtrl',
    )
    expect(materialCandidates({
      modelPath: 'chara/human/c0201/obj/hair/h0001/model/c0201h0001_hir.mdl',
      materialPaths: [],
    }, '/mt_c0201h0001_hir_a.mtrl', 1)[0]).toBe(
      'chara/human/c0201/obj/hair/h0001/material/v0001/mt_c0201h0001_hir_a.mtrl',
    )
  })
})
