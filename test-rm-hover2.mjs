import fs from 'fs'

let armor = fs.readFileSync('src/components/ArmorCatalog.tsx', 'utf8')
armor = armor.replace(
  '                          <div className="item-hover-menu">\n                            <a className="item-hover-link" href={`https://ffxiv.consolegameswiki.com/wiki/${encodeURIComponent(item.name.replace(/ /g, \'_\'))}`} target="_blank" rel="noopener noreferrer">Wiki ↗</a>\n                            <a className="item-hover-link" href={`https://universalis.app/market/${item.id}`} target="_blank" rel="noopener noreferrer">Universalis ↗</a>\n                          </div>',
  ''
)
fs.writeFileSync('src/components/ArmorCatalog.tsx', armor)

let styles = fs.readFileSync('src/styles.css', 'utf8')
styles = styles.replace(
  '.dressing-slot:hover .item-hover-menu,\n.armor-result:hover .item-hover-menu {\n  display: flex;\n}',
  '.dressing-slot:hover .item-hover-menu {\n  display: flex;\n}'
)
styles = styles.replace(
  '.dressing-slot:hover, .armor-result:hover {\n  z-index: 60;\n}',
  '.dressing-slot:hover {\n  z-index: 60;\n}'
)
fs.writeFileSync('src/styles.css', styles)
