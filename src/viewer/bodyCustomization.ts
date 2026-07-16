import type { DecodedModel } from '../asset-source/mdl'
import * as THREE from 'three'

export function isBustBoneName(name: string): boolean {
  return /^j_mune_[lr]$/i.test(name)
}

/** Approximation of the skin shader's muscle-detail parameter for Three.js. */
export function muscleNormalStrength(muscleTone: number): number {
  const amount = Math.min(100, Math.max(0, Number.isFinite(muscleTone) ? muscleTone : 0)) / 100
  return 0.35 + amount * 1.15
}

export interface BustWeightSummary {
  modelBones: string[]
  weightedVertices: number
  totalWeight: number
  maximumWeight: number
}

/** Reports whether an MDL actually contains vertices influenced by j_mune. */
export function bustWeightSummary(model: DecodedModel): BustWeightSummary {
  const bustIndices = new Set(model.boneNames.flatMap((name, index) => isBustBoneName(name) ? [index] : []))
  const modelBones = [...bustIndices].map((index) => `${model.boneNames[index]}@${index}`)
  const seenWeights = new Set<ArrayBufferLike>()
  let weightedVertices = 0
  let totalWeight = 0
  let maximumWeight = 0
  for (const mesh of model.meshes) {
    if (!mesh.skinIndices || !mesh.skinWeights || seenWeights.has(mesh.skinWeights.buffer)) continue
    seenWeights.add(mesh.skinWeights.buffer)
    const vertexCount = mesh.skinWeights.length / 4
    for (let vertex = 0; vertex < vertexCount; vertex += 1) {
      let vertexWeight = 0
      for (let influence = 0; influence < 4; influence += 1) {
        const offset = vertex * 4 + influence
        if (bustIndices.has(mesh.skinIndices[offset] ?? -1)) vertexWeight += mesh.skinWeights[offset] ?? 0
      }
      if (vertexWeight <= 0) continue
      weightedVertices += 1
      totalWeight += vertexWeight
      maximumWeight = Math.max(maximumWeight, vertexWeight)
    }
  }
  return { modelBones, weightedVertices, totalWeight, maximumWeight }
}

export interface BustDeformationResult {
  transformSpace: 'bone-local'
  weightedVertices: number
  maximumDisplacement: number
  averageDisplacement: [number, number, number]
  averageDistance: number
  affectedTriangles: number
  totalTriangles: number
  uniqueVertexBuffers: number
  beforeBounds: BustBounds
  afterBounds: BustBounds
  maximumVertex?: BustVertexDiagnostic
  bones: BustBoneDiagnostic[]
}

export interface BustBounds {
  min: [number, number, number]
  max: [number, number, number]
  size: [number, number, number]
  center: [number, number, number]
}

export interface BustVertexDiagnostic {
  meshIndex: number
  vertexIndex: number
  original: [number, number, number]
  deformed: [number, number, number]
  displacement: [number, number, number]
  distance: number
  bustWeight: number
  influences: string[]
}

export interface BustBoneDiagnostic {
  name: string
  modelIndex: number
  rigIndex?: number
  parentName?: string
  localPosition?: [number, number, number]
  bindWorldPosition?: [number, number, number]
  currentWorldPosition?: [number, number, number]
  localScale?: [number, number, number]
  deltaScale?: [number, number, number]
  transformDeterminant?: number
  mapped: boolean
}

function tuple3(vector: THREE.Vector3): [number, number, number] {
  return [vector.x, vector.y, vector.z]
}

function emptyBounds(): BustBounds {
  return { min: [0, 0, 0], max: [0, 0, 0], size: [0, 0, 0], center: [0, 0, 0] }
}

function boundsDiagnostic(box: THREE.Box3): BustBounds {
  if (box.isEmpty()) return emptyBounds()
  return {
    min: tuple3(box.min),
    max: tuple3(box.max),
    size: tuple3(box.getSize(new THREE.Vector3())),
    center: tuple3(box.getCenter(new THREE.Vector3())),
  }
}

/**
 * Bakes the current j_mune bone delta into MDL positions. This mirrors linear
 * blend skinning but avoids relying on a shared Three.js Skeleton preserving a
 * non-bind scale across every subsequently bound submesh.
 */
export function applyBustDeformation(
  model: DecodedModel,
  skeleton: THREE.Skeleton,
  rigBoneIndex: ReadonlyMap<string, number>,
): BustDeformationResult {
  const transforms = new Map<number, THREE.Matrix4>()
  const normalTransforms = new Map<number, THREE.Matrix3>()
  const bones: BustBoneDiagnostic[] = []
  model.boneNames.forEach((name, modelIndex) => {
    if (!isBustBoneName(name)) return
    const rigIndex = rigBoneIndex.get(name)
      ?? [...rigBoneIndex].find(([candidate]) => candidate.toLowerCase() === name.toLowerCase())?.[1]
    const bone = rigIndex === undefined ? undefined : skeleton.bones[rigIndex]
    const inverse = rigIndex === undefined ? undefined : skeleton.boneInverses[rigIndex]
    if (!bone || !inverse) {
      bones.push({ name, modelIndex, rigIndex, mapped: false })
      return
    }
    const transform = new THREE.Matrix4().multiplyMatrices(bone.matrixWorld, inverse)
    transforms.set(modelIndex, transform)
    normalTransforms.set(modelIndex, new THREE.Matrix3().getNormalMatrix(transform))
    const bindMatrix = inverse.clone().invert()
    const bindPosition = new THREE.Vector3().setFromMatrixPosition(bindMatrix)
    bones.push({
      name,
      modelIndex,
      rigIndex,
      parentName: bone.parent?.name || undefined,
      localPosition: tuple3(bone.position),
      bindWorldPosition: tuple3(bindPosition),
      currentWorldPosition: tuple3(new THREE.Vector3().setFromMatrixPosition(bone.matrixWorld)),
      localScale: tuple3(bone.scale),
      deltaScale: tuple3(new THREE.Vector3().setFromMatrixScale(transform)),
      transformDeterminant: transform.determinant(),
      mapped: true,
    })
  })

  const seenPositions = new Set<ArrayBufferLike>()
  const weightedByBuffer = new Map<ArrayBufferLike, Set<number>>()
  const original = new THREE.Vector3()
  const transformed = new THREE.Vector3()
  const deformed = new THREE.Vector3()
  const originalNormal = new THREE.Vector3()
  const transformedNormal = new THREE.Vector3()
  const beforeBox = new THREE.Box3()
  const afterBox = new THREE.Box3()
  let weightedVertices = 0
  let maximumDisplacement = 0
  let sumDeltaX = 0
  let sumDeltaY = 0
  let sumDeltaZ = 0
  let sumDistance = 0
  let maximumVertex: BustVertexDiagnostic | undefined
  for (const [meshIndex, mesh] of model.meshes.entries()) {
    if (!mesh.skinIndices || !mesh.skinWeights || seenPositions.has(mesh.positions.buffer)) continue
    seenPositions.add(mesh.positions.buffer)
    const weightedIndices = new Set<number>()
    weightedByBuffer.set(mesh.positions.buffer, weightedIndices)
    const vertexCount = mesh.positions.length / 3
    for (let vertex = 0; vertex < vertexCount; vertex += 1) {
      const positionOffset = vertex * 3
      original.fromArray(mesh.positions, positionOffset)
      let deltaX = 0
      let deltaY = 0
      let deltaZ = 0
      let bustWeight = 0
      let normalX = 0
      let normalY = 0
      let normalZ = 0
      if (mesh.normals) originalNormal.fromArray(mesh.normals, positionOffset)
      for (let influence = 0; influence < 4; influence += 1) {
        const skinOffset = vertex * 4 + influence
        const weight = mesh.skinWeights[skinOffset] ?? 0
        const modelBoneIndex = mesh.skinIndices[skinOffset] ?? -1
        const transform = transforms.get(modelBoneIndex)
        if (weight <= 0 || !transform) continue
        transformed.copy(original).applyMatrix4(transform)
        deltaX += (transformed.x - original.x) * weight
        deltaY += (transformed.y - original.y) * weight
        deltaZ += (transformed.z - original.z) * weight
        bustWeight += weight
        const normalTransform = normalTransforms.get(modelBoneIndex)
        if (mesh.normals && normalTransform) {
          transformedNormal.copy(originalNormal).applyMatrix3(normalTransform).normalize()
          normalX += transformedNormal.x * weight
          normalY += transformedNormal.y * weight
          normalZ += transformedNormal.z * weight
        }
      }
      if (bustWeight <= 0) continue
      weightedIndices.add(vertex)
      beforeBox.expandByPoint(original)
      deformed.set(original.x + deltaX, original.y + deltaY, original.z + deltaZ)
      afterBox.expandByPoint(deformed)
      mesh.positions[positionOffset] = deformed.x
      mesh.positions[positionOffset + 1] = deformed.y
      mesh.positions[positionOffset + 2] = deformed.z
      if (mesh.normals) {
        transformedNormal.set(
          originalNormal.x * (1 - bustWeight) + normalX,
          originalNormal.y * (1 - bustWeight) + normalY,
          originalNormal.z * (1 - bustWeight) + normalZ,
        ).normalize()
        mesh.normals.set(transformedNormal.toArray(), positionOffset)
      }
      weightedVertices += 1
      sumDeltaX += deltaX
      sumDeltaY += deltaY
      sumDeltaZ += deltaZ
      const distance = Math.hypot(deltaX, deltaY, deltaZ)
      sumDistance += distance
      if (distance >= maximumDisplacement) {
        maximumDisplacement = distance
        const influences = Array.from({ length: 4 }, (_, influence) => {
          const skinOffset = vertex * 4 + influence
          const modelBoneIndex = mesh.skinIndices![skinOffset] ?? -1
          const name = model.boneNames[modelBoneIndex] ?? `bone-${modelBoneIndex}`
          return `${name}@${modelBoneIndex}:${(mesh.skinWeights![skinOffset] ?? 0).toFixed(6)}`
        }).filter((_, influence) => (mesh.skinWeights![vertex * 4 + influence] ?? 0) > 0)
        maximumVertex = {
          meshIndex,
          vertexIndex: vertex,
          original: tuple3(original),
          deformed: tuple3(deformed),
          displacement: [deltaX, deltaY, deltaZ],
          distance,
          bustWeight,
          influences,
        }
      }
    }
  }
  let affectedTriangles = 0
  let totalTriangles = 0
  for (const mesh of model.meshes) {
    const weightedIndices = weightedByBuffer.get(mesh.positions.buffer)
    for (let index = 0; index + 2 < mesh.indices.length; index += 3) {
      totalTriangles += 1
      if (weightedIndices && [mesh.indices[index], mesh.indices[index + 1], mesh.indices[index + 2]]
        .some((vertex) => weightedIndices.has(vertex!))) affectedTriangles += 1
    }
  }
  const divisor = Math.max(1, weightedVertices)
  return {
    transformSpace: 'bone-local',
    weightedVertices,
    maximumDisplacement,
    averageDisplacement: [sumDeltaX / divisor, sumDeltaY / divisor, sumDeltaZ / divisor],
    averageDistance: sumDistance / divisor,
    affectedTriangles,
    totalTriangles,
    uniqueVertexBuffers: seenPositions.size,
    beforeBounds: boundsDiagnostic(beforeBox),
    afterBounds: boundsDiagnostic(afterBox),
    maximumVertex,
    bones,
  }
}
