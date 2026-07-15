export const HAIR_EST_PATH = 'chara/xls/charadb/extra_hair.est'

function assertEst(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

/** Resolves an equipment/customization set to the extra skeleton selected by an EST table. */
export function extraSkeletonId(bytes: ArrayBuffer, raceCode: number, setId: number): number {
  assertEst(bytes.byteLength >= 4, 'The EST header is truncated.')
  const view = new DataView(bytes)
  const count = view.getUint32(0, true)
  assertEst(count <= 100_000 && 4 + count * 6 <= bytes.byteLength, 'The EST entry table is truncated.')
  const skeletonOffset = 4 + count * 4
  for (let index = 0; index < count; index += 1) {
    const descriptor = 4 + index * 4
    if (view.getUint16(descriptor, true) !== setId) continue
    if (view.getUint16(descriptor + 2, true) !== raceCode) continue
    return view.getUint16(skeletonOffset + index * 2, true)
  }
  return 0
}
