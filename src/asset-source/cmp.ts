import type { AssetSource } from './types'
import { createLocalAssetReader } from './sqpack'

export const HUMAN_CMP_PATH = 'chara/xls/charamake/human.cmp'

// CmpData is a packed blob: two 9,216-byte global color tables, followed by
// 32 race/gender color blocks of 5,120 bytes, then the racial scale table.
const GLOBAL_COLOR_BYTES = 2 * 9_216
const RACIAL_COLOR_BYTES = 32 * 5_120
const RACIAL_SCALE_OFFSET = GLOBAL_COLOR_BYTES + RACIAL_COLOR_BYTES
const RACE_SCALE_BYTES = 10 * 56
const CLAN_SCALE_BYTES = 56
const BUST_SCALE_OFFSET = 32

export type BustScale = [number, number, number]

function assertCmp(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

export function cmpBustOffset(tribeId: number): number {
  assertCmp(Number.isSafeInteger(tribeId) && tribeId >= 1 && tribeId <= 16, 'The CMP tribe is out of range.')
  const clanIndex = tribeId - 1
  return RACIAL_SCALE_OFFSET
    + Math.floor(clanIndex / 2) * RACE_SCALE_BYTES
    + (clanIndex % 2) * CLAN_SCALE_BYTES
    + BUST_SCALE_OFFSET
}

/** Matches the client GetRspBust interpolation for one female clan. */
export function parseCmpBustScale(bytes: ArrayBuffer, tribeId: number, bustSize: number): BustScale {
  const offset = cmpBustOffset(tribeId)
  assertCmp(bytes.byteLength >= offset + 24, 'The human.cmp racial bust table is truncated.')
  assertCmp(Number.isFinite(bustSize), 'The bust size is invalid.')
  const amount = Math.min(100, Math.max(0, bustSize)) / 100
  const view = new DataView(bytes)
  const result: BustScale = [0, 1, 2].map((axis) => {
    const minimum = view.getFloat32(offset + axis * 4, true)
    const maximum = view.getFloat32(offset + 12 + axis * 4, true)
    assertCmp(Number.isFinite(minimum) && minimum > 0 && Number.isFinite(maximum) && maximum > 0, 'The human.cmp bust scale contains invalid values.')
    return minimum + (maximum - minimum) * amount
  }) as BustScale
  return result
}

export async function loadLocalBustScale(
  source: Extract<AssetSource, { kind: 'local' }>,
  tribeId: number,
  bustSize: number,
): Promise<BustScale> {
  return parseCmpBustScale(await createLocalAssetReader(source).read(HUMAN_CMP_PATH), tribeId, bustSize)
}
