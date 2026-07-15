import type { DecodedModel, DecodedModelMesh } from './mdl'
import type { DecodedSkeleton } from './sklb'

export const HUMAN_PBD_PATH = 'chara/xls/boneDeformer/human.pbd'

type DeformMatrix = Float32Array

export interface PbdDeformer {
  raceCode: number
  parentRaceCode?: number
  matrices: Map<string, DeformMatrix>
}

export interface DecodedPbd {
  deformers: PbdDeformer[]
}

interface Header {
  raceCode: number
  treeEntryIndex: number
  offset: number
}

interface TreeEntry {
  parentIndex: number
  deformerIndex: number
}

const IDENTITY = Float32Array.from([
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
])

function assertPbd(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function readString(bytes: Uint8Array, offset: number): string {
  assertPbd(offset >= 0 && offset < bytes.byteLength, 'A PBD bone-name offset is outside the file.')
  let end = offset
  while (end < bytes.byteLength && bytes[end] !== 0) end += 1
  assertPbd(end < bytes.byteLength, 'A PBD bone name is not null-terminated.')
  return new TextDecoder().decode(bytes.subarray(offset, end))
}

export function decodePbd(buffer: ArrayBuffer): DecodedPbd {
  const view = new DataView(buffer)
  const bytes = new Uint8Array(buffer)
  assertPbd(view.byteLength >= 4, 'The PBD header is truncated.')
  const entryCount = view.getInt32(0, true)
  assertPbd(entryCount > 0 && entryCount <= 256, `The PBD entry count ${entryCount} is invalid.`)
  const headerEnd = 4 + entryCount * 12
  const treeEnd = headerEnd + entryCount * 8
  assertPbd(treeEnd <= view.byteLength, 'The PBD race tree is truncated.')

  const headers: Header[] = Array.from({ length: entryCount }, (_, index) => {
    const offset = 4 + index * 12
    return {
      raceCode: view.getUint16(offset, true),
      treeEntryIndex: view.getUint16(offset + 2, true),
      offset: view.getInt32(offset + 4, true),
    }
  })
  const tree: TreeEntry[] = Array.from({ length: entryCount }, (_, index) => {
    const offset = headerEnd + index * 8
    return {
      parentIndex: view.getInt16(offset, true),
      deformerIndex: view.getInt16(offset + 6, true),
    }
  })

  const deformers = headers.map((header): PbdDeformer => {
    assertPbd(header.treeEntryIndex < tree.length, `PBD race ${header.raceCode} references an invalid tree entry.`)
    const link = tree[header.treeEntryIndex]!
    let parentRaceCode: number | undefined
    if (link.parentIndex >= 0) {
      const parentLink = tree[link.parentIndex]
      assertPbd(parentLink && parentLink.deformerIndex >= 0 && parentLink.deformerIndex < headers.length, `PBD race ${header.raceCode} has an invalid parent.`)
      parentRaceCode = headers[parentLink.deformerIndex]!.raceCode
    }

    const matrices = new Map<string, DeformMatrix>()
    if (header.offset !== 0) {
      assertPbd(header.offset >= treeEnd && header.offset + 4 <= view.byteLength, `PBD race ${header.raceCode} has an invalid deformer offset.`)
      const boneCount = view.getInt32(header.offset, true)
      assertPbd(boneCount >= 0 && boneCount <= 4096, `PBD race ${header.raceCode} has an invalid bone count.`)
      const offsetsStart = header.offset + 4
      const matrixStart = offsetsStart + boneCount * 2 + (boneCount % 2) * 2
      assertPbd(matrixStart + boneCount * 48 <= view.byteLength, `PBD race ${header.raceCode} has truncated deformation matrices.`)
      for (let bone = 0; bone < boneCount; bone += 1) {
        const nameOffset = header.offset + view.getUint16(offsetsStart + bone * 2, true)
        const name = readString(bytes, nameOffset)
        const matrixOffset = matrixStart + bone * 48
        const matrix = new Float32Array(12)
        for (let value = 0; value < 12; value += 1) matrix[value] = view.getFloat32(matrixOffset + value * 4, true)
        assertPbd(matrix.every(Number.isFinite), `PBD race ${header.raceCode} contains a non-finite matrix for ${name}.`)
        matrices.set(name, matrix)
      }
    }
    return { raceCode: header.raceCode, parentRaceCode, matrices }
  })

  return { deformers }
}

export function modelRaceCode(path: string): number | undefined {
  const match = path.match(/(?:^|[^A-Za-z])c(\d{4})/)
  return match?.[1] ? Number(match[1]) : undefined
}

export function deformationChain(pbd: DecodedPbd, sourceRaceCode: number, targetRaceCode: number): PbdDeformer[] {
  if (sourceRaceCode === targetRaceCode) return []
  const byRace = new Map(pbd.deformers.map((deformer) => [deformer.raceCode, deformer]))
  const reversed: PbdDeformer[] = []
  const visited = new Set<number>()
  let current = targetRaceCode
  while (current !== sourceRaceCode) {
    assertPbd(!visited.has(current), `The PBD race tree contains a cycle at c${current.toString().padStart(4, '0')}.`)
    visited.add(current)
    const deformer = byRace.get(current)
    assertPbd(deformer, `The PBD contains no deformer for c${current.toString().padStart(4, '0')}.`)
    reversed.push(deformer)
    assertPbd(deformer.parentRaceCode !== undefined, `c${sourceRaceCode.toString().padStart(4, '0')} is not an ancestor of c${targetRaceCode.toString().padStart(4, '0')} in human.pbd.`)
    current = deformer.parentRaceCode
  }
  return reversed.reverse()
}

function applyMatrix(matrix: DeformMatrix, x: number, y: number, z: number): [number, number, number] {
  return [
    x * matrix[0]! + y * matrix[1]! + z * matrix[2]! + matrix[3]!,
    x * matrix[4]! + y * matrix[5]! + z * matrix[6]! + matrix[7]!,
    x * matrix[8]! + y * matrix[9]! + z * matrix[10]! + matrix[11]!,
  ]
}

function deformationForBone(
  deformer: PbdDeformer,
  boneName: string,
  skeleton: DecodedSkeleton,
  skeletonIndex: Map<string, number>,
): DeformMatrix {
  let index = skeletonIndex.get(boneName)
  while (index !== undefined && index >= 0) {
    const bone = skeleton.bones[index]
    if (!bone) break
    const matrix = deformer.matrices.get(bone.name)
    if (matrix) return matrix
    index = bone.parentIndex
  }
  return IDENTITY
}

function deformMeshPositions(
  mesh: DecodedModelMesh,
  boneNames: string[],
  chain: PbdDeformer[],
  skeleton: DecodedSkeleton,
  skeletonIndex: Map<string, number>,
): number {
  if (!mesh.skinIndices || !mesh.skinWeights) return 0
  const resolved = chain.map(() => new Map<number, DeformMatrix>())
  const vertexCount = mesh.positions.length / 3
  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    const positionOffset = vertex * 3
    const skinOffset = vertex * 4
    let x = mesh.positions[positionOffset]!
    let y = mesh.positions[positionOffset + 1]!
    let z = mesh.positions[positionOffset + 2]!
    for (let step = 0; step < chain.length; step += 1) {
      const deformer = chain[step]!
      let nextX = 0
      let nextY = 0
      let nextZ = 0
      let totalWeight = 0
      for (let influence = 0; influence < 4; influence += 1) {
        const weight = mesh.skinWeights[skinOffset + influence] ?? 0
        if (weight <= 0) continue
        const boneIndex = mesh.skinIndices[skinOffset + influence] ?? 0
        let matrix = resolved[step]!.get(boneIndex)
        if (!matrix) {
          matrix = deformationForBone(deformer, boneNames[boneIndex] ?? '', skeleton, skeletonIndex)
          resolved[step]!.set(boneIndex, matrix)
        }
        const transformed = applyMatrix(matrix, x, y, z)
        nextX += transformed[0] * weight
        nextY += transformed[1] * weight
        nextZ += transformed[2] * weight
        totalWeight += weight
      }
      if (totalWeight > 0) {
        if (totalWeight < 1) {
          nextX += x * (1 - totalWeight)
          nextY += y * (1 - totalWeight)
          nextZ += z * (1 - totalWeight)
        }
        x = nextX
        y = nextY
        z = nextZ
      }
    }
    mesh.positions[positionOffset] = x
    mesh.positions[positionOffset + 1] = y
    mesh.positions[positionOffset + 2] = z
  }
  return vertexCount
}

/** Applies the game's sequential, skin-weighted racial deformation to shared fallback geometry. */
export function deformModel(
  model: DecodedModel,
  pbd: DecodedPbd,
  skeleton: DecodedSkeleton,
  sourceRaceCode: number,
  targetRaceCode: number,
): void {
  const chain = deformationChain(pbd, sourceRaceCode, targetRaceCode)
  if (!chain.length) return
  const skeletonIndex = new Map(skeleton.bones.map((bone, index) => [bone.name, index]))
  const uniquePositions = new Set<ArrayBufferLike>()
  let vertices = 0
  const bounds = { min: [Infinity, Infinity, Infinity] as [number, number, number], max: [-Infinity, -Infinity, -Infinity] as [number, number, number] }
  for (const mesh of model.meshes) {
    if (uniquePositions.has(mesh.positions.buffer)) continue
    uniquePositions.add(mesh.positions.buffer)
    vertices += deformMeshPositions(mesh, model.boneNames, chain, skeleton, skeletonIndex)
    for (let offset = 0; offset < mesh.positions.length; offset += 3) {
      for (let axis = 0; axis < 3; axis += 1) {
        const value = mesh.positions[offset + axis]!
        bounds.min[axis] = Math.min(bounds.min[axis]!, value)
        bounds.max[axis] = Math.max(bounds.max[axis]!, value)
      }
    }
  }
  if (vertices > 0) model.bounds = bounds
  model.deformation = {
    sourceRaceCode,
    targetRaceCode,
    steps: chain.length,
    matrixBones: new Set(chain.flatMap((deformer) => [...deformer.matrices.keys()])).size,
    vertices,
  }
}
