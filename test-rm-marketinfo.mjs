import fs from 'fs'
let src = fs.readFileSync('src/components/MarketInfo.tsx', 'utf8')
src = src.replace(
  '<div className="market-info-links">\n        <a\n          className="market-info-link"\n          href={wikiItemUrl(item.name)}\n          target="_blank"\n          rel="noopener noreferrer"\n          title={`Open “${item.name}” on the FFXIV wiki`}\n        >\n          Wiki ↗\n        </a>\n        <a\n          className="market-info-link"\n          href={`https://universalis.app/market/${item.id}`}\n          target="_blank"\n          rel="noopener noreferrer"\n          title={`Open “${item.name}” on Universalis`}\n        >\n          Universalis ↗\n        </a>\n      </div>',
  ''
)
fs.writeFileSync('src/components/MarketInfo.tsx', src)
