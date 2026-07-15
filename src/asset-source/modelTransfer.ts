import type { DecodedModel } from './mdl'

interface ModelResult {
  path: string
  model?: DecodedModel
}

/** Builds a transferable list without repeating vertex buffers shared by submeshes. */
export function modelTransferBuffers(results: ModelResult[]): ArrayBuffer[] {
  const buffers = new Set<ArrayBuffer>()
  for (const result of results) {
    for (const mesh of result.model?.meshes ?? []) {
      for (const buffer of [
        mesh.positions.buffer,
        mesh.normals?.buffer,
        mesh.uvs?.buffer,
        mesh.skinIndices?.buffer,
        mesh.skinWeights?.buffer,
        mesh.indices.buffer,
      ]) {
        if (buffer instanceof ArrayBuffer) buffers.add(buffer)
      }
    }
  }
  return [...buffers]
}
