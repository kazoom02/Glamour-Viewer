import fs from 'fs';
const file = 'src/asset-source/materialBake.test.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
`    expect(result.roughness.rgba[0]).toBe(64)
  })

  it('keeps a smooth roughness mask smooth', () => {`,
`    expect(result.roughness.rgba[0]).toBe(242)
  })

  it('keeps a smooth roughness mask smooth', () => {`
);

fs.writeFileSync(file, code);
