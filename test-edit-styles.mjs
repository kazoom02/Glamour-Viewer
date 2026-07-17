import fs from 'fs'
let styles = fs.readFileSync('src/styles.css', 'utf8')
styles = styles.replace(
  '.market-info-wiki { flex: none; align-self: center; padding: 6px 10px; border: 1px solid #4a4d54; border-radius: 5px; background: #24262b; color: #ede8de; font-size: 11px; text-decoration: none; white-space: nowrap; }',
  '.market-info-links { display: flex; flex-direction: column; gap: 4px; justify-content: center; flex: none; align-self: center; }\n.market-info-link { flex: none; text-align: center; padding: 6px 10px; border: 1px solid #4a4d54; border-radius: 5px; background: #24262b; color: #ede8de; font-size: 11px; text-decoration: none; white-space: nowrap; }'
)
styles = styles.replace(
  '.market-info-wiki:hover { border-color: #8b7550; background: #302a21; color: var(--gold-bright); }',
  '.market-info-link:hover { border-color: #8b7550; background: #302a21; color: var(--gold-bright); }'
)
fs.writeFileSync('src/styles.css', styles)
