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

  it('resolves globally shared hairstyle materials from Midlander folders', () => {
    expect(materialCandidates({
      modelPath: 'chara/human/c0601/obj/hair/h0120/model/c0601h0120_hir.mdl',
      materialPaths: [],
    }, '/mt_c0601h0120_hir_a.mtrl', 1)[0]).toBe(
      'chara/human/c0201/obj/hair/h0120/material/v0001/mt_c0201h0120_hir_a.mtrl',
    )
    expect(materialCandidates({
      modelPath: 'chara/human/c0701/obj/hair/h0105/model/c0701h0105_hir.mdl',
      materialPaths: [],
    }, '/mt_c0701h0105_hir_a.mtrl', 1)[0]).toBe(
      'chara/human/c0701/obj/hair/h0105/material/v0001/mt_c0701h0105_hir_a.mtrl',
    )
  })

  it('uses IMC variants for accessory and weapon materials', () => {
    expect(materialCandidates({
      modelPath: 'chara/accessory/a0001/model/c0201a0001_ear.mdl',
      materialPaths: [],
    }, '/mt_c0201a0001_ear_a.mtrl', 2)[0]).toBe(
      'chara/accessory/a0001/material/v0002/mt_c0201a0001_ear_a.mtrl',
    )
    expect(materialCandidates({
      modelPath: 'chara/weapon/w2901/obj/body/b0001/model/w2901b0001.mdl',
      materialPaths: [],
    }, '/mt_w2901b0001_a.mtrl', 3)[0]).toBe(
      'chara/weapon/w2901/obj/body/b0001/material/v0003/mt_w2901b0001_a.mtrl',
    )
  })
})
