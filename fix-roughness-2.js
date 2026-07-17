import fs from 'fs';
const file = 'src/asset-source/materialBake.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
`      const textureRoughness = textures.mask
        ? 1 - mask[1] / 255
        : rowRoughness`,
`      const textureRoughness = textures.mask
        ? (legacyShader ? 1 - mask[1] / 255 : mask[1] / 255)
        : rowRoughness`
);

fs.writeFileSync(file, code);
