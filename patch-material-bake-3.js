import fs from 'fs';
const file = 'src/asset-source/materialBake.ts';
let code = fs.readFileSync(file, 'utf8');
code = code.replace(
`      const opacity = 1 // textures.normal && textures.normal.format !== TEX_FORMAT.BC5
        // ? sample(textures.normal, x, y, width, height)[2] / 255
        // : 1`,
`      const opacity = textures.normal && textures.normal.format !== TEX_FORMAT.BC5
        ? sample(textures.normal, x, y, width, height)[2] / 255
        : 1`
);
fs.writeFileSync(file, code);
