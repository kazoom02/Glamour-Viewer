import type { EquipmentSlot } from '../catalog/types'

const ENTRY_SIZE = 6
const SLOT_PART: Record<EquipmentSlot, number> = {
  mainHand: 0,
  offHand: 0,
  head: 0,
  body: 1,
  hands: 2,
  legs: 3,
  feet: 4,
  ears: 0,
  neck: 1,
  wrists: 2,
  rightRing: 3,
  leftRing: 4,
}

export interface ImcEntry {
  materialId: number
  decalId: number
  attributeAndSound: number
  vfxId: number
  materialAnimationId: number
  attributeMask: number
  soundId: number
}

/** Resolves the AVFX convention used by equipment and weapon IMC rows. */
export function equipmentVfxPath(modelPath: string, vfxId: number): string | undefined {
  if (!Number.isInteger(vfxId) || vfxId <= 0) return undefined
  const effect = vfxId.toString().padStart(4, '0')
  const weapon = /^(chara\/weapon\/w\d{4}\/obj\/body\/b\d{4})\//i.exec(modelPath)
  if (weapon) return `${weapon[1]}/vfx/eff/vw${effect}.avfx`.toLowerCase()
  const equipment = /^(chara\/equipment\/e\d{4})\//i.exec(modelPath)
  if (equipment) return `${equipment[1]}/vfx/eff/ve${effect}.avfx`.toLowerCase()
  return undefined
}

/** Resolves the authored material-color PAP selected by a weapon IMC row. */
export function equipmentMaterialAnimationPath(modelPath: string, animationId: number): string | undefined {
  if (!Number.isInteger(animationId) || animationId <= 0) return undefined
  const weapon = /^chara\/weapon\/(w\d{4})\/obj\/body\/b\d{4}\//i.exec(modelPath)
  if (!weapon) return undefined
  return `chara/weapon/${weapon[1]!.toLowerCase()}/animation/s${animationId.toString().padStart(4, '0')}/body/material.pap`
}

/** Reads an equipment IMC row. Variants include row zero, matching the game's Variant id. */
export function readImcEntry(bytes: ArrayBuffer, slot: EquipmentSlot, variant: number): ImcEntry {
  if (bytes.byteLength < 4) throw new Error('The IMC preamble is truncated.')
  const view = new DataView(bytes)
  const variantCount = view.getUint16(0, true)
  const partMask = view.getUint16(2, true)
  const part = SLOT_PART[slot]
  if ((partMask & (1 << part)) === 0) throw new Error(`The IMC file has no ${slot} part.`)
  if (!Number.isInteger(variant) || variant < 0 || variant > variantCount) {
    throw new Error(`IMC variant ${variant} is outside 0-${variantCount}.`)
  }
  const partCount = Array.from({ length: 16 }, (_, index) => (partMask >>> index) & 1)
    .reduce((sum, bit) => sum + bit, 0)
  const partIndex = Array.from({ length: part }, (_, index) => (partMask >>> index) & 1)
    .reduce((sum, bit) => sum + bit, 0)
  const offset = 4 + (variant * partCount + partIndex) * ENTRY_SIZE
  if (offset + ENTRY_SIZE > bytes.byteLength) throw new Error('The IMC variant table is truncated.')
  const attributeAndSound = view.getUint16(offset + 2, true)
  return {
    materialId: view.getUint8(offset),
    decalId: view.getUint8(offset + 1),
    attributeAndSound,
    vfxId: view.getUint8(offset + 4),
    materialAnimationId: view.getUint8(offset + 5),
    attributeMask: attributeAndSound & 0x3ff,
    soundId: attributeAndSound >>> 10,
  }
}
