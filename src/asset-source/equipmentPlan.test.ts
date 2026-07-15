import { describe, expect, it } from 'vitest'
import type { ArmorItem } from '../catalog/types'
import { equipmentAssetPlan } from './equipmentPlan'

const item: ArmorItem = {
  id: 8619,
  name: 'Ironworks Robe of Healing',
  modelValue: 65_726,
  modelSet: 190,
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
      variant: 1,
      modelPath: 'chara/equipment/e0190/model/c0201e0190_top.mdl',
      imcPath: 'chara/equipment/e0190/e0190.imc',
      materialDirectory: 'chara/equipment/e0190/material/v0001/',
    })
  })
})
