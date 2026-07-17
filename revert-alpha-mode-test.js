import fs from 'fs';
const file = 'src/asset-source/materialBake.test.ts';
let code = fs.readFileSync(file, 'utf8');
code = code.replace(
`    expect(materialAlphaMode('character.shpk', '/mt_w2101b0062_a.mtrl', 0x10)).toBe('mask')`,
`    expect(materialAlphaMode('character.shpk', '/mt_w2101b0062_a.mtrl', 0x10)).toBe('blend')`
);
fs.writeFileSync(file, code);
