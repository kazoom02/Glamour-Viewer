import { describe, expect, it } from 'vitest'
import type { DecodedModel } from './mdl'
import { modelTransferBuffers } from './modelTransfer'

describe('model worker transfer buffers', () => {
  it('deduplicates vertex buffers shared by decoded submeshes', () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])
    const model: DecodedModel = {
      materialPaths: [],
      boneNames: [],
      bounds: { min: [0, 0, 0], max: [1, 1, 0] },
      meshes: [
        { positions, indices: new Uint16Array([0, 1, 2]), materialIndex: 0 },
        { positions, indices: new Uint16Array([0, 2, 1]), materialIndex: 0 },
      ],
    }

    const transfer = modelTransferBuffers([{ path: 'shared.mdl', model }])
    expect(transfer).toHaveLength(3)
    expect(transfer.filter((buffer) => buffer === positions.buffer)).toHaveLength(1)
  })
})
