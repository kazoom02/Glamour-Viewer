import fs from 'fs'

let armor = fs.readFileSync('src/components/ArmorCatalog.tsx', 'utf8')

// Remove imports
armor = armor.replace(
  "import { fetchDataCenters, fetchWorlds, type UniversalisDataCenter } from '../catalog/universalis'",
  ""
)
armor = armor.replace("import MarketInfo from './MarketInfo'\n", "")

// Remove constants and state
armor = armor.replace("const MARKET_SCOPE_STORAGE_KEY = 'gv.marketScope'\n", "")
armor = armor.replace(
  `  const [marketScope, setMarketScope] = useState<string>(() => {
    try { return localStorage.getItem(MARKET_SCOPE_STORAGE_KEY) ?? '' } catch { return '' }
  })
  const [dataCenters, setDataCenters] = useState<UniversalisDataCenter[]>([])
  const [worldNames, setWorldNames] = useState<Map<number, string>>(new Map())`,
  ""
)

// Remove useEffect
armor = armor.replace(
  `  // Load Universalis world/data-center lists once to populate the price selector.
  useEffect(() => {
    let active = true
    Promise.all([fetchDataCenters(), fetchWorlds()])
      .then(([centers, worlds]) => {
        if (!active) return
        setDataCenters(centers)
        setWorldNames(new Map(worlds.map((world) => [world.id, world.name] as [number, string])))
      })
      .catch(() => { /* market prices simply stay unavailable if Universalis is unreachable */ })
    return () => { active = false }
  }, [])`,
  ""
)

// Remove changeMarketScope
armor = armor.replace(
  `  const changeMarketScope = (value: string) => {
    setMarketScope(value)
    try {
      if (value) localStorage.setItem(MARKET_SCOPE_STORAGE_KEY, value)
      else localStorage.removeItem(MARKET_SCOPE_STORAGE_KEY)
    } catch { /* private-mode storage failures are non-fatal */ }
  }`,
  ""
)

// Remove renderMarketScopeField
armor = armor.replace(
  `  // Inlined (not a nested component) so the controlled <select> is not remounted
  // on every render, matching how the rest of this file renders its fields.
  const renderMarketScopeField = () => {
    if (dataCenters.length === 0) return null
    return (
      <div className="catalog-field">
        <label className="field-label" htmlFor="market-scope">Market prices</label>
        <select id="market-scope" value={marketScope} onChange={(event) => changeMarketScope(event.target.value)}>
          <option value="">Off — pick a world/DC</option>
          {dataCenters.map((center) => (
            <optgroup key={center.name} label={\`\${center.region} — \${center.name}\`}>
              <option value={center.name}>{center.name} (all worlds)</option>
              {center.worlds
                .map((id) => worldNames.get(id))
                .filter((name): name is string => Boolean(name))
                .sort((a, b) => a.localeCompare(b))
                .map((name) => <option key={name} value={name}>{name}</option>)}
            </optgroup>
          ))}
        </select>
      </div>
    )
  }`,
  ""
)

// Remove invocation of renderMarketScopeField
armor = armor.replace("{renderMarketScopeField()}", "")

// Remove MarketInfo popover
armor = armor.replace(
  `                          {hoverItemId === item.id && (
                            <div className="armor-market-popover">
                              <MarketInfo item={item} scope={marketScope || undefined} />
                            </div>
                          )}`,
  ""
)

fs.writeFileSync('src/components/ArmorCatalog.tsx', armor)
