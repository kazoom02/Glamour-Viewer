import fs from 'fs';
const file = 'src/asset-source/materialBake.test.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
`  it('reads the Dawntrail mask green channel as roughness, not gloss', () => {`,
`  it('reads the mask green channel as gloss, so glossy metal stays reflective', () => {`
);

code = code.replace(
`    // A matte cloth: rough colorset row, near-white roughness mask.
    const result = bakeCharacterMaterial({ kind: 'dawntrail', rows }, {
      index: texture([0, 255, 0, 255]),
      mask: texture([255, 242, 255, 255]),
    })!

    expect(result.roughness.rgba[0]).toBe(242)
  })`,
`    // A polished weapon: rough colorset row but a near-white gloss mask. The
    // gloss map wins, so the surface is smooth (floored) instead of matte black.
    const result = bakeCharacterMaterial({ kind: 'dawntrail', rows }, {
      index: texture([0, 255, 0, 255]),
      mask: texture([255, 242, 255, 255]),
    })!

    expect(result.roughness.rgba[0]).toBe(64)
  })`
);

code = code.replace(
`  it('keeps a smooth roughness mask smooth', () => {
    const rows = Array.from({ length: 32 }, () => ({
      diffuse: [1, 1, 1] as [number, number, number],
      specular: [1, 1, 1] as [number, number, number],
      specularMask: 1,
      emissive: [0, 0, 0] as [number, number, number],
      roughness: 0.05,
      metalness: 0,
    }))
    // Low roughness (green 16) is a smooth surface.
    const result = bakeCharacterMaterial({ kind: 'dawntrail', rows }, {
      index: texture([0, 255, 0, 255]),
      mask: texture([255, 16, 255, 255]),
    })!

    expect(result.roughness.rgba[0]).toBe(64) // 0.25 max
  })`,
`  it('keeps a matte gloss mask rough', () => {
    const rows = Array.from({ length: 32 }, () => ({
      diffuse: [1, 1, 1] as [number, number, number],
      specular: [1, 1, 1] as [number, number, number],
      specularMask: 1,
      emissive: [0, 0, 0] as [number, number, number],
      roughness: 0.05,
      metalness: 0,
    }))
    // Low gloss (green 16) is a matte surface, so it stays rough even though the
    // colorset row is smooth: the per-pixel gloss map is the authored detail.
    const result = bakeCharacterMaterial({ kind: 'dawntrail', rows }, {
      index: texture([0, 255, 0, 255]),
      mask: texture([255, 16, 255, 255]),
    })!

    expect(result.roughness.rgba[0]).toBe(239)
  })`
);

fs.writeFileSync(file, code);
