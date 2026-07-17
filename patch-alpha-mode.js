import fs from 'fs';
const file = 'src/asset-source/materialBake.ts';
let code = fs.readFileSync(file, 'utf8');
code = code.replace(
`export function materialAlphaMode(shaderPackage: string, materialReference: string, shaderFlags = 0): MaterialAlphaMode {
  const shader = shaderPackage.toLowerCase()
  const face = /mt_c\\d{4}f\\d{4}/i.test(materialReference)
  if ((shaderFlags & 0x10) !== 0) return 'blend'
  if (shader === 'characterglass.shpk' || shader === 'charactertattoo.shpk') return 'blend'
  if (shader === 'hair.shpk') return face ? 'blend' : 'mask'
  if (shader === 'skin.shpk') return face ? 'mask' : 'opaque'
  if (shader === 'character.shpk' || shader === 'characterlegacy.shpk') return 'mask'
  return 'opaque'
}`,
`export function materialAlphaMode(shaderPackage: string, materialReference: string, shaderFlags = 0): MaterialAlphaMode {
  const shader = shaderPackage.toLowerCase()
  const face = /mt_c\\d{4}f\\d{4}/i.test(materialReference)
  if (shader === 'characterglass.shpk' || shader === 'charactertattoo.shpk') return 'blend'
  if (shader === 'hair.shpk') return face ? 'blend' : 'mask'
  if (shader === 'skin.shpk') return face ? 'mask' : 'opaque'
  if (shader === 'character.shpk' || shader === 'characterlegacy.shpk') return 'mask'
  if ((shaderFlags & 0x10) !== 0) return 'blend'
  return 'opaque'
}`
);
fs.writeFileSync(file, code);
