import fs from 'fs';
const file = 'src/asset-source/materialBake.ts';
let code = fs.readFileSync(file, 'utf8');
code = code.replace(
`    ? normalized * 12.92
    // : 1.055 * normalized ** (1 / 2.4) - 0.055`,
`    ? normalized * 12.92
    : 1.055 * normalized ** (1 / 2.4) - 0.055`
);
fs.writeFileSync(file, code);
