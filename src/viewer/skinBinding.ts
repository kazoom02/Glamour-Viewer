export interface RemappedSkinIndices {
  indices: Uint16Array
  missingBoneNames: string[]
}

/**
 * Resolves MDL-global bone indices onto the combined Three.js character rig.
 *
 * Auxiliary hair skeletons are optional in the game data. When one is absent,
 * sending an unresolved hair influence to bone zero anchors those vertices to
 * the world/root while the head moves. Callers can instead provide `j_kao` so
 * the hairstyle remains rigidly attached to the head as a safe fallback.
 */
export function remapSkinIndices(
  source: Uint16Array,
  modelBoneNames: readonly string[],
  rigBoneIndex: ReadonlyMap<string, number>,
  fallbackBoneName?: string,
): RemappedSkinIndices {
  const fallbackIndex = fallbackBoneName === undefined
    ? 0
    : rigBoneIndex.get(fallbackBoneName) ?? 0
  const missing = new Set<string>()
  const indices = new Uint16Array(source.length)

  for (let offset = 0; offset < source.length; offset += 1) {
    const name = modelBoneNames[source[offset]!] ?? ''
    const mapped = rigBoneIndex.get(name)
    indices[offset] = mapped ?? fallbackIndex
    if (mapped === undefined && name) missing.add(name)
  }

  return { indices, missingBoneNames: [...missing] }
}
