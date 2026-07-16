import type { DecodedModel } from '../asset-source/mdl'

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
