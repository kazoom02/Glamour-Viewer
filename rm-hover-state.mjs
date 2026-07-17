import fs from 'fs'

let armor = fs.readFileSync('src/components/ArmorCatalog.tsx', 'utf8')

armor = armor.replace("  const [hoverItemId, setHoverItemId] = useState<number | null>(null)\n", "")

armor = armor.replace(
  `  // Hover-intent: only reveal the market panel (which triggers a fetch) once the
  // pointer rests on an item, so skimming the list doesn't request every item.
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (hoverTimer.current) clearTimeout(hoverTimer.current) }, [])
  const handleHoverEnter = (id: number) => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
    hoverTimer.current = setTimeout(() => setHoverItemId(id), 180)
  }
  const handleHoverLeave = (id: number) => {
    if (hoverTimer.current) { clearTimeout(hoverTimer.current); hoverTimer.current = null }
    setHoverItemId((current) => (current === id ? null : current))
  }`,
  ""
)

armor = armor.replace("                          onMouseEnter={() => handleHoverEnter(item.id)}\n", "")
armor = armor.replace("                          onMouseLeave={() => handleHoverLeave(item.id)}\n", "")
armor = armor.replace("                          onFocus={() => setHoverItemId(item.id)}\n", "")

fs.writeFileSync('src/components/ArmorCatalog.tsx', armor)
