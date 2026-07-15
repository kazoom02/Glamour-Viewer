import { describe, expect, it } from 'vitest'
import type { ArmorItem } from '../catalog/types'
import { equipmentAssetPlan } from './equipmentPlan'

const item: ArmorItem = {
  id: 8619,
  name: 'Ironworks Robe of Healing',
  modelValue: 65_726,
  modelSet: 190,
  modelBase: 0,
  modelVariant: 1,
  slot: 'body',
  dyeCount: 0,
  equipLevel: 50,
  jobs: 'CNJ WHM SCH AST SGE',
}

describe('equipmentAssetPlan', () => {
  it('resolves deterministic equipment paths for a race model', () => {
    expect(equipmentAssetPlan(item, 'c0201')).toEqual({
      itemId: 8619,
      raceCode: 'c0201',
      setId: 190,
      baseId: 0,
      variant: 1,
      objectType: 'equipment',
      modelPath: 'chara/equipment/e0190/model/c0201e0190_top.mdl',
      imcPath: 'chara/equipment/e0190/e0190.imc',
      materialDirectory: 'chara/equipment/e0190/material/v0001/',
    })
  })

  it('resolves race-specific accessory paths', () => {
    expect(equipmentAssetPlan({
      ...item,
      id: 1521,
      name: 'Dated Copper Earrings',
      modelValue: 131_073,
      modelSet: 1,
      modelVariant: 2,
      slot: 'ears',
    }, 'c0601')).toEqual({
      itemId: 1521,
      raceCode: 'c0601',
      setId: 1,
      baseId: 0,
      variant: 2,
      objectType: 'accessory',
      modelPath: 'chara/accessory/a0001/model/c0601a0001_ear.mdl',
      imcPath: 'chara/accessory/a0001/a0001.imc',
      materialDirectory: 'chara/accessory/a0001/material/v0002/',
    })
  })

  it('resolves packed weapon body and variant paths', () => {
    expect(equipmentAssetPlan({
      ...item,
      id: 42589,
      name: 'Angel Brush',
      modelValue: 4_295_035_733,
      modelSet: 2901,
      modelBase: 1,
      modelVariant: 1,
      slot: 'mainHand',
    }, 'c0201')).toEqual({
      itemId: 42589,
      raceCode: 'c0201',
      setId: 2901,
      baseId: 1,
      variant: 1,
      objectType: 'weapon',
      modelPath: 'chara/weapon/w2901/obj/body/b0001/model/w2901b0001.mdl',
      imcPath: 'chara/weapon/w2901/obj/body/b0001/b0001.imc',
      materialDirectory: 'chara/weapon/w2901/obj/body/b0001/material/v0001/',
    })
  })
})
