import fs from 'fs'
let armor = fs.readFileSync('src/components/ArmorCatalog.tsx', 'utf8')
armor = armor.replace(
  '{isEquipped ? \'Unequip\' : \'Equip\'}\n                          </button>',
  '{isEquipped ? \'Unequip\' : \'Equip\'}\n                          </button>\n                          <div className="item-hover-menu">\n                            <a className="item-hover-link" href={`https://ffxiv.consolegameswiki.com/wiki/${encodeURIComponent(item.name.replace(/ /g, \'_\'))}`} target="_blank" rel="noopener noreferrer">Wiki ↗</a>\n                            <a className="item-hover-link" href={`https://universalis.app/market/${item.id}`} target="_blank" rel="noopener noreferrer">Universalis ↗</a>\n                          </div>'
)
fs.writeFileSync('src/components/ArmorCatalog.tsx', armor)
