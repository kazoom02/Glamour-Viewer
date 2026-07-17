import fs from 'fs';
const file = 'src/asset-source/avfx.ts';
let code = fs.readFileSync(file, 'utf8');
if (code.includes('case 4:')) console.log('Type 4 parser exists');
