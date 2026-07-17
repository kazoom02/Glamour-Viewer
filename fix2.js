import fs from 'fs';
const file = 'src/asset-source/materialBake.ts';
let code = fs.readFileSync(file, 'utf8');
code = code.replaceAll('// : 1', ': 1');
fs.writeFileSync(file, code);
