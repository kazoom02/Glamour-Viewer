import { type FormEvent, useRef, useState } from 'react'
import type { AssetSource } from '../asset-source/types'
import { equipmentAssetPlan } from '../asset-source/equipmentPlan'
import { ARMOR_SLOTS, type ArmorItem, type EquippedArmor } from '../catalog/types'
import { searchArmor, xivapiIconUrl } from '../catalog/xivapi'

interface Props {
  source: AssetSource
  equipped: EquippedArmor
  onEquip: (item: ArmorItem) => void
  onRemove: (slot: ArmorItem['slot']) => void
}

const SLOT_LABELS: Record<ArmorItem['slot'], string> = {
  head: 'Head',
  body: 'Body',
  hands: 'Hands',
  legs: 'Legs',
  feet: 'Feet',
}

export default function ArmorCatalog({ source, equipped, onEquip, onRemove }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ArmorItem[]>([])
  const [version, setVersion] = useState<string>()
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const abortRef = useRef<AbortController>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setBusy(true)
    setError(undefined)
    try {
      const page = await searchArmor(query, controller.signal)
      setResults(page.items)
      setVersion(page.version)
      if (!page.items.length) setError('No wearable head, body, hand, leg, or foot items matched that search.')
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') return
      setError(caught instanceof Error ? caught.message : 'The armor catalog could not be searched.')
    } finally {
      if (abortRef.current === controller) setBusy(false)
    }
  }

  return (
    <section className="catalog-section" aria-labelledby="catalog-title">
      <div className="catalog-heading">
        <div>
          <p className="eyebrow">XIVAPI v2 catalog</p>
          <h2 id="catalog-title">Choose armor to equip</h2>
          <p>
            XIVAPI supplies names, icons, slots, and model identifiers. The actual model and texture bytes still come from <strong>{source.label}</strong>.
          </p>
        </div>
        {version && <span className="catalog-version">Game data {version.slice(0, 8)}</span>}
      </div>

      <form className="catalog-search" onSubmit={submit}>
        <label className="field-label" htmlFor="armor-search">Armor name</label>
        <div className="url-row">
          <input
            id="armor-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Try Ironworks, Neo-Ishgardian, or hempen"
            minLength={2}
            autoComplete="off"
          />
          <button className="button primary" disabled={busy || query.trim().length < 2}>
            {busy ? 'Searching…' : 'Search armor'}
          </button>
        </div>
      </form>

      {error && <p className="error-message catalog-error" role="alert">{error}</p>}

      {results.length > 0 && (
        <div className="armor-results" aria-label="Armor search results">
          {results.map((item) => {
            const isEquipped = equipped[item.slot]?.id === item.id
            return (
              <article className="armor-result" key={item.id}>
                <div className="armor-icon">
                  {item.iconPath ? <img src={xivapiIconUrl(item.iconPath)} alt="" loading="lazy" /> : <span>—</span>}
                </div>
                <div className="armor-copy">
                  <span>{SLOT_LABELS[item.slot]} · Level {item.equipLevel}</span>
                  <strong>{item.name}</strong>
                  <small>{item.jobs} · Model e{item.modelSet.toString().padStart(4, '0')} v{item.modelVariant.toString().padStart(4, '0')}</small>
                </div>
                <button className={`button ${isEquipped ? 'equipped' : 'secondary'}`} onClick={() => onEquip(item)} disabled={isEquipped}>
                  {isEquipped ? 'Equipped' : 'Equip'}
                </button>
              </article>
            )
          })}
        </div>
      )}

      <div className="equipment-tray">
        <div className="tray-heading">
          <strong>Current armor</strong>
          <span>Asset paths target Midlander female (<code>c0201</code>) for the first decoder milestone.</span>
        </div>
        <div className="equipment-slots">
          {ARMOR_SLOTS.map((slot) => {
            const item = equipped[slot]
            const plan = item ? equipmentAssetPlan(item) : undefined
            return (
              <div className={`equipment-slot ${item ? 'filled' : ''}`} key={slot}>
                <span>{SLOT_LABELS[slot]}</span>
                {item ? (
                  <>
                    <strong>{item.name}</strong>
                    <code title={plan?.modelPath}>{plan?.modelPath}</code>
                    <button className="text-button" onClick={() => onRemove(slot)}>Remove</button>
                  </>
                ) : <small>Empty</small>}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
