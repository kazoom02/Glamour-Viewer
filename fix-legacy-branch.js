import fs from 'fs';
const file = 'src/asset-source/materialBake.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
`      } else {
        first = Math.min(table.rows.length - 1, Math.round(selection[1] / 17))
        second = Math.min(table.rows.length - 1, Math.round(selection[2] / 17))
        blend = base[3] / 255
      }`,
`      } else {
        first = second = Math.min(table.rows.length - 1, Math.round(selection[3] / 17))
        blend = 0
      }`
);

fs.writeFileSync(file, code);
