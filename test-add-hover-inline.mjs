import fs from 'fs'

let armor = fs.readFileSync('src/components/ArmorCatalog.tsx', 'utf8')

// Add links directly into the flow rather than absolute positioning, which often gets clipped by `overflow: hidden` on parent containers or grids.
let styles = fs.readFileSync('src/styles.css', 'utf8')
styles = styles.replace(
  '.item-hover-menu {\n  position: absolute;\n  top: 100%;\n  left: 0;\n  right: 0;\n  z-index: 50;\n  display: none;\n  flex-direction: column;\n  gap: 4px;\n  padding: 8px;\n  background: #14151af6;\n  border: 1px solid #4e473b;\n  border-radius: 7px;\n  box-shadow: 0 12px 28px #0009;\n  backdrop-filter: blur(6px);\n}',
  '/* Removed absolute pos for inline rendering */\n.item-hover-menu {\n  display: none;\n  grid-column: 1 / -1;\n  flex-direction: column;\n  gap: 4px;\n  margin-top: 4px;\n}'
)
fs.writeFileSync('src/styles.css', styles)
