import fs from 'fs'

// Update CSS
let styles = fs.readFileSync('src/styles.css', 'utf8')
styles += `
.item-hover-menu {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  z-index: 50;
  display: none;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  background: #14151af6;
  border: 1px solid #4e473b;
  border-radius: 7px;
  box-shadow: 0 12px 28px #0009;
  backdrop-filter: blur(6px);
}
.dressing-slot:hover .item-hover-menu,
.armor-result:hover .item-hover-menu {
  display: flex;
}
.item-hover-link {
  display: block;
  text-align: center;
  padding: 6px 10px;
  border: 1px solid #4a4d54;
  border-radius: 5px;
  background: #24262b;
  color: #ede8de;
  font-size: 11px;
  text-decoration: none;
  white-space: nowrap;
}
.item-hover-link:hover {
  border-color: #8b7550;
  background: #302a21;
  color: var(--gold-bright);
}
`
fs.writeFileSync('src/styles.css', styles)

// Update ArmorCatalog.tsx
let armor = fs.readFileSync('src/components/ArmorCatalog.tsx', 'utf8')

// Add links to dressing-slot
armor = armor.replace(
  '{item && isWeaponSlot(slot) && (',
  '{item && (\n          <div className="item-hover-menu">\n            <a className="item-hover-link" href={`https://ffxiv.consolegameswiki.com/wiki/${encodeURIComponent(item.name.replace(/ /g, \\\'_\\\'))}`} target="_blank" rel="noopener noreferrer">Wiki ↗</a>\n            <a className="item-hover-link" href={`https://universalis.app/market/${item.id}`} target="_blank" rel="noopener noreferrer">Universalis ↗</a>\n          </div>\n        )}\n        {item && isWeaponSlot(slot) && ('
)

// Add links to armor-result
armor = armor.replace(
  '                          <button\n                            className={`button ${isEquipped ? \\\'equipped\\\' : \\\'secondary\\\'}`}\n                            type="button"\n                            onClick={() => isEquipped ? onRemove(selectedSlot) : equip(item)}\n                          >\n                            {isEquipped ? \\\'Unequip\\\' : \\\'Equip\\\'}\n                          </button>',
  '                          <button\n                            className={`button ${isEquipped ? \\\'equipped\\\' : \\\'secondary\\\'}`}\n                            type="button"\n                            onClick={() => isEquipped ? onRemove(selectedSlot) : equip(item)}\n                          >\n                            {isEquipped ? \\\'Unequip\\\' : \\\'Equip\\\'}\n                          </button>\n                          <div className="item-hover-menu">\n                            <a className="item-hover-link" href={`https://ffxiv.consolegameswiki.com/wiki/${encodeURIComponent(item.name.replace(/ /g, \\\'_\\\'))}`} target="_blank" rel="noopener noreferrer">Wiki ↗</a>\n                            <a className="item-hover-link" href={`https://universalis.app/market/${item.id}`} target="_blank" rel="noopener noreferrer">Universalis ↗</a>\n                          </div>'
)

fs.writeFileSync('src/components/ArmorCatalog.tsx', armor)
