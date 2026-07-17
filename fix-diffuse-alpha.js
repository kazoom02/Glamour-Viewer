import fs from 'fs';
const file = 'src/asset-source/materialBake.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
`      diffuse[target + 3] = clampByte((base[3] / 255) * opacity)`,
`      const baseAlpha = table.kind === 'dawntrail' ? base[3] / 255 : 1
      diffuse[target + 3] = clampByte(baseAlpha * opacity * 255)`
);

fs.writeFileSync(file, code);
