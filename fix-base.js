import fs from 'fs';
const file = 'src/asset-source/materialBake.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
`      if (table.kind === 'dawntrail') {
        const pair = Math.min(15, Math.round(selection[0] / 17))
        first = Math.min(table.rows.length - 1, pair * 2)
        second = Math.min(table.rows.length - 1, first + 1)
        blend = 1 - selection[1] / 255
      } else {
        first = Math.min(table.rows.length - 1, Math.round(selection[1] / 17))
        second = Math.min(table.rows.length - 1, Math.round(selection[2] / 17))
        blend = base[3] / 255
      }
      const a = table.rows[first]!
      const b = table.rows[second]!
      const mix = (left: number, right: number) => left + (right - left) * blend
      const base = sample(textures.diffuse, x, y, width, height)`,
`      const base = sample(textures.diffuse, x, y, width, height)
      if (table.kind === 'dawntrail') {
        const pair = Math.min(15, Math.round(selection[0] / 17))
        first = Math.min(table.rows.length - 1, pair * 2)
        second = Math.min(table.rows.length - 1, first + 1)
        blend = 1 - selection[1] / 255
      } else {
        first = Math.min(table.rows.length - 1, Math.round(selection[1] / 17))
        second = Math.min(table.rows.length - 1, Math.round(selection[2] / 17))
        blend = base[3] / 255
      }
      const a = table.rows[first]!
      const b = table.rows[second]!
      const mix = (left: number, right: number) => left + (right - left) * blend`
);

fs.writeFileSync(file, code);
