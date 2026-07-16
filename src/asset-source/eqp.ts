export const EQUIPMENT_PARAMETER_PATH = 'chara/xls/equipmentparameter/equipmentparameter.eqp'

const BLOCK_SIZE = 160
const BLOCK_COUNT = 64
const ENTRY_SIZE = 8
const DEFAULT_ENTRY = 0x3fe00070603f00n
const HEAD_HIDE_SCALP = 1n << 41n
const HEAD_HIDE_HAIR = 1n << 42n
const HEAD_SHOW_HAIR_OVERRIDE = 1n << 43n

export interface HeadEquipmentVisibility {
  hideScalp: boolean
  hideHair: boolean
  showHairOverride: boolean
  /** Matches the client rule: Show Hair Override wins over Hide Hair. */
  hairHidden: boolean
}

function assertEqp(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function popCount(value: bigint): number {
  let remaining = value
  let count = 0
  while (remaining) {
    remaining &= remaining - 1n
    count += 1
  }
  return count
}

/** Reads one primary equipment set from the client's compressed EQP table. */
export function equipmentParameterEntry(bytes: ArrayBuffer, setId: number): bigint {
  assertEqp(bytes.byteLength >= ENTRY_SIZE, 'The EQP control block is truncated.')
  assertEqp(Number.isSafeInteger(setId) && setId >= 0 && setId < BLOCK_SIZE * BLOCK_COUNT, 'The EQP equipment set is out of range.')
  const view = new DataView(bytes)
  const normalizedSet = setId <= 0 ? 1 : setId
  const block = Math.floor(normalizedSet / BLOCK_SIZE)
  const control = view.getBigUint64(0, true)
  const blockBit = 1n << BigInt(block)
  if ((control & blockBit) === 0n) return DEFAULT_ENTRY
  const expandedBefore = popCount(control & (blockBit - 1n))
  const indexInBlock = normalizedSet % BLOCK_SIZE
  const offset = (expandedBefore * BLOCK_SIZE + indexInBlock) * ENTRY_SIZE
  assertEqp(offset + ENTRY_SIZE <= bytes.byteLength, `The EQP entry for set ${setId} is truncated.`)
  return view.getBigUint64(offset, true)
}

export function headEquipmentVisibility(bytes: ArrayBuffer, setId: number): HeadEquipmentVisibility {
  const entry = equipmentParameterEntry(bytes, setId)
  const hideScalp = (entry & HEAD_HIDE_SCALP) !== 0n
  const hideHair = (entry & HEAD_HIDE_HAIR) !== 0n
  const showHairOverride = (entry & HEAD_SHOW_HAIR_OVERRIDE) !== 0n
  return { hideScalp, hideHair, showHairOverride, hairHidden: hideHair && !showHairOverride }
}
