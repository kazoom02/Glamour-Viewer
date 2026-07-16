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
  weightedVertices: number
  maximumDisplacement: number
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
  model.boneNames.forEach((name, modelIndex) => {
    if (!isBustBoneName(name)) return
    const rigIndex = rigBoneIndex.get(name)
      ?? [...rigBoneIndex].find(([candidate]) => candidate.toLowerCase() === name.toLowerCase())?.[1]
    const bone = rigIndex === undefined ? undefined : skeleton.bones[rigIndex]
    const inverse = rigIndex === undefined ? undefined : skeleton.boneInverses[rigIndex]
    if (!bone || !inverse) return
    const transform = new THREE.Matrix4().multiplyMatrices(bone.matrixWorld, inverse)
    transforms.set(modelIndex, transform)
    normalTransforms.set(modelIndex, new THREE.Matrix3().getNormalMatrix(transform))
  })

  const seenPositions = new Set<ArrayBufferLike>()
  const original = new THREE.Vector3()
  const transformed = new THREE.Vector3()
  const originalNormal = new THREE.Vector3()
  const transformedNormal = new THREE.Vector3()
  let weightedVertices = 0
  let maximumDisplacement = 0
  for (const mesh of model.meshes) {
    if (!mesh.skinIndices || !mesh.skinWeights || seenPositions.has(mesh.positions.buffer)) continue
    seenPositions.add(mesh.positions.buffer)
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
      mesh.positions[positionOffset] = original.x + deltaX
      mesh.positions[positionOffset + 1] = original.y + deltaY
      mesh.positions[positionOffset + 2] = original.z + deltaZ
      if (mesh.normals) {
        transformedNormal.set(
          originalNormal.x * (1 - bustWeight) + normalX,
          originalNormal.y * (1 - bustWeight) + normalY,
          originalNormal.z * (1 - bustWeight) + normalZ,
        ).normalize()
        mesh.normals.set(transformedNormal.toArray(), positionOffset)
      }
      weightedVertices += 1
      maximumDisplacement = Math.max(maximumDisplacement, Math.hypot(deltaX, deltaY, deltaZ))
    }
  }
  return { weightedVertices, maximumDisplacement }
}
