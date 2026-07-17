import { readFileSync } from 'fs';
const text = readFileSync('src/asset-source/materialBake.ts', 'utf8');
if (text.includes('1 - mask[1] / 255')) console.log('still inverted');
