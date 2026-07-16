import type { DecodedModelMesh } from '../asset-source/mdl'

const BARYCENTRIC_VERTICES: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
  [0.5, 0.5, 0],
  [0, 0.5, 0.5],
  [0.5, 0, 0.5],
]

const SUBDIVIDED_INDICES = [0, 3, 5, 3, 1, 4, 5, 4, 2, 3, 4, 5] as const

function vector3(values: Float32Array, vertex: number): [number, number, number] {
  const offset = vertex * 3
  return [values[offset]!, values[offset + 1]!, values[offset + 2]!]
}

function interpolate(values: Float32Array, itemSize: number, vertices: readonly number[], weights: readonly number[]): number[] {
  return Array.from({ length: itemSize }, (_, component) => vertices.reduce(
    (sum, vertex, index) => sum + values[vertex * itemSize + component]! * weights[index]!,
    0,
  ))
}

function normalize(values: number[]): number[] {
  const length = Math.hypot(...values)
  return length > 1e-8 ? values.map((value) => value / length) : values
}

function distance(a: readonly number[], b: readonly number[]): number {
  return Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!)
}

function curvedPosition(
  positions: readonly [number, number, number][],
  normals: readonly [number, number, number][],
  weights: readonly number[],
  strength: number,
): number[] {
  const linear = [0, 1, 2].map((axis) => positions.reduce(
    (sum, position, index) => sum + position[axis]! * weights[index]!,
    0,
  ))
  const projected = [0, 0, 0]
  for (let corner = 0; corner < 3; corner += 1) {
    if (weights[corner] === 0) continue
    const position = positions[corner]!
    const normal = normals[corner]!
    const alongNormal = (linear[0]! - position[0]!) * normal[0]!
      + (linear[1]! - position[1]!) * normal[1]!
      + (linear[2]! - position[2]!) * normal[2]!
    for (let axis = 0; axis < 3; axis += 1) {
      projected[axis] = projected[axis]! + (linear[axis]! - alongNormal * normal[axis]!) * weights[corner]!
    }
  }
  const curved = linear.map((value, axis) => value + (projected[axis]! - value) * strength)
  const maximumOffset = Math.max(
    distance(positions[0]!, positions[1]!),
    distance(positions[1]!, positions[2]!),
    distance(positions[2]!, positions[0]!),
  ) * 0.18
  const offset = distance(linear, curved)
  if (offset > maximumOffset && offset > 0) {
    const clamp = maximumOffset / offset
    return linear.map((value, axis) => value + (curved[axis]! - value) * clamp)
  }
  return curved
}

function interpolatedSkin(
  mesh: DecodedModelMesh,
  vertices: readonly number[],
  weights: readonly number[],
): { indices: number[]; weights: number[] } {
  if (!mesh.skinIndices || !mesh.skinWeights) return { indices: [0, 0, 0, 0], weights: [0, 0, 0, 0] }
  const combined = new Map<number, number>()
  vertices.forEach((vertex, corner) => {
    for (let influence = 0; influence < 4; influence += 1) {
      const offset = vertex * 4 + influence
      const weight = mesh.skinWeights![offset]! * weights[corner]!
      if (weight <= 0) continue
      const bone = mesh.skinIndices![offset]!
      combined.set(bone, (combined.get(bone) ?? 0) + weight)
    }
  })
  const strongest = [...combined].sort((a, b) => b[1] - a[1]).slice(0, 4)
  while (strongest.length < 4) strongest.push([0, 0])
  const total = strongest.reduce((sum, entry) => sum + entry[1], 0)
  return {
    indices: strongest.map((entry) => entry[0]),
    weights: strongest.map((entry) => total > 0 ? entry[1] / total : 0),
  }
}

/**
 * Adds one curvature-aware triangle subdivision level while retaining UVs and
 * four-weight skinning. It preserves every authored corner and uses the
 * authored smooth normals only to curve the new edge points.
 */
export function subdivideCurvedMesh(mesh: DecodedModelMesh, strength = 0.72): DecodedModelMesh {
  if (!mesh.normals || mesh.indices.length < 3 || mesh.indices.length % 3 !== 0) return mesh
  const triangleCount = mesh.indices.length / 3
  const vertexCount = triangleCount * BARYCENTRIC_VERTICES.length
  // WebGL2 supports 32-bit element indices. Dense hair, tails, and ears can
  // cross the old Uint16 ceiling after refinement and should not silently fall
  // back to their visibly faceted source geometry.
  if (vertexCount > 1_000_000) return mesh
  const positions = new Float32Array(vertexCount * 3)
  const normals = new Float32Array(vertexCount * 3)
  const uvs = mesh.uvs ? new Float32Array(vertexCount * 2) : undefined
  const uvs2 = mesh.uvs2 ? new Float32Array(vertexCount * 2) : undefined
  const skinIndices = mesh.skinIndices ? new Uint16Array(vertexCount * 4) : undefined
  const skinWeights = mesh.skinWeights ? new Float32Array(vertexCount * 4) : undefined
  const indices = vertexCount > 65_535
    ? new Uint32Array(triangleCount * SUBDIVIDED_INDICES.length)
    : new Uint16Array(triangleCount * SUBDIVIDED_INDICES.length)

  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const sourceVertices = [
      mesh.indices[triangle * 3]!,
      mesh.indices[triangle * 3 + 1]!,
      mesh.indices[triangle * 3 + 2]!,
    ]
    const sourcePositions = sourceVertices.map((vertex) => vector3(mesh.positions, vertex))
    const sourceNormals = sourceVertices.map((vertex) => vector3(mesh.normals!, vertex))
    const outputBase = triangle * BARYCENTRIC_VERTICES.length
    BARYCENTRIC_VERTICES.forEach((weights, localVertex) => {
      const outputVertex = outputBase + localVertex
      positions.set(curvedPosition(sourcePositions, sourceNormals, weights, strength), outputVertex * 3)
      normals.set(normalize(interpolate(mesh.normals!, 3, sourceVertices, weights)), outputVertex * 3)
      if (uvs && mesh.uvs) uvs.set(interpolate(mesh.uvs, 2, sourceVertices, weights), outputVertex * 2)
      if (uvs2 && mesh.uvs2) uvs2.set(interpolate(mesh.uvs2, 2, sourceVertices, weights), outputVertex * 2)
      if (skinIndices && skinWeights) {
        const skin = interpolatedSkin(mesh, sourceVertices, weights)
        skinIndices.set(skin.indices, outputVertex * 4)
        skinWeights.set(skin.weights, outputVertex * 4)
      }
    })
    SUBDIVIDED_INDICES.forEach((index, offset) => { indices[triangle * SUBDIVIDED_INDICES.length + offset] = outputBase + index })
  }

  return {
    ...mesh,
    positions,
    normals,
    uvs,
    uvs2,
    skinIndices,
    skinWeights,
    indices,
  }
}
