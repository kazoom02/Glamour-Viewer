import { type FormEvent, useEffect, useRef, useState } from 'react'
import type { AssetSource } from '../asset-source/types'
import { equipmentAssetPlan } from '../asset-source/equipmentPlan'
import { ARMOR_SLOTS, type ArmorItem, type ArmorSlot, type EquippedArmor } from '../catalog/types'
import { continueArmorSearch, searchArmor, xivapiIconUrl } from '../catalog/xivapi'
import { CHARACTER_PRESETS, type CharacterRaceCode } from '../asset-source/characterPlan'

interface Props {
  source: AssetSource
  equipped: EquippedArmor
  raceCode: CharacterRaceCode
  onRaceChange: (raceCode: CharacterRaceCode) => void
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

export default function ArmorCatalog({ source, equipped, raceCode, onRaceChange, onEquip, onRemove }: Props) {
  const [query, setQuery] = useState('')
  const [selectedSlot, setSelectedSlot] = useState<ArmorSlot>('head')
  const [results, setResults] = useState<ArmorItem[]>([])
  const [nextCursor, setNextCursor] = useState<string>()
  const [version, setVersion] = useState<string>()
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const abortRef = useRef<AbortController>(null)

  async function loadCatalog(search: string, slot: ArmorSlot, append = false, cursor?: string) {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setBusy(true)
    setError(undefined)
    if (!append) {
      setResults([])
      setNextCursor(undefined)
    }
    try {
      const page = cursor
        ? await continueArmorSearch(cursor, slot, controller.signal)
        : await searchArmor(search, slot, controller.signal)
      setResults((current) => {
        if (!append) return page.items
        const byId = new Map(current.map((item) => [item.id, item]))
        page.items.forEach((item) => byId.set(item.id, item))
        return [...byId.values()]
      })
      setNextCursor(page.next)
      setVersion(page.version)
      if (!page.items.length && !append) setError(`No ${SLOT_LABELS[slot].toLowerCase()} equipment matched that search.`)
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') return
      setError(caught instanceof Error ? caught.message : 'The armor catalog could not be searched.')
    } finally {
      if (abortRef.current === controller) setBusy(false)
    }
  }

  useEffect(() => {
    void loadCatalog('', selectedSlot)
    return () => abortRef.current?.abort()
  }, [selectedSlot])

  function submit(event: FormEvent) {
    event.preventDefault()
    void loadCatalog(query, selectedSlot)
  }

  function selectCategory(slot: ArmorSlot) {
    setQuery('')
    if (slot === selectedSlot) void loadCatalog('', slot)
    else setSelectedSlot(slot)
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
        <div className="catalog-controls">
          <label className="catalog-character" htmlFor="character-race">
            <span className="field-label">Character</span>
            <select
              id="character-race"
              value={raceCode}
              onChange={(event) => onRaceChange(event.target.value as CharacterRaceCode)}
            >
              {CHARACTER_PRESETS.map(([code, label]) => <option value={code} key={code}>{label}</option>)}
            </select>
          </label>
          {version && <span className="catalog-version">Game data {version.slice(0, 8)}</span>}
        </div>
      </div>

      <nav className="catalog-categories" aria-label="Armor categories">
        {ARMOR_SLOTS.map((slot) => (
          <button
            className={selectedSlot === slot ? 'active' : ''}
            type="button"
            aria-pressed={selectedSlot === slot}
            onClick={() => selectCategory(slot)}
            key={slot}
          >
            <span>{SLOT_LABELS[slot]}</span>
            {equipped[slot] && <small>Equipped</small>}
          </button>
        ))}
      </nav>

      <form className="catalog-search" onSubmit={submit}>
        <label className="field-label" htmlFor="armor-search">Search within {SLOT_LABELS[selectedSlot]}</label>
        <div className="url-row">
          <input
            id="armor-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Search ${SLOT_LABELS[selectedSlot].toLowerCase()} equipment, or leave empty to show all`}
            autoComplete="off"
          />
          <button className="button primary" disabled={busy || query.trim().length === 1}>
            {busy ? 'Loading…' : query.trim() ? `Search ${SLOT_LABELS[selectedSlot]}` : `Show all ${SLOT_LABELS[selectedSlot]}`}
          </button>
        </div>
      </form>

      {error && <p className="error-message catalog-error" role="alert">{error}</p>}

      {results.length > 0 && (
        <>
        <div className="catalog-results-heading">
          <strong>{SLOT_LABELS[selectedSlot]} equipment</strong>
          <span>{results.length} loaded{nextCursor ? ' · more available' : ''}</span>
        </div>
        <div className="armor-results" aria-label={`${SLOT_LABELS[selectedSlot]} armor results`}>
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
        {nextCursor && (
          <button
            className="button secondary catalog-load-more"
            type="button"
            disabled={busy}
            onClick={() => void loadCatalog(query, selectedSlot, true, nextCursor)}
          >
            {busy ? 'Loading…' : `Load more ${SLOT_LABELS[selectedSlot].toLowerCase()} equipment`}
          </button>
        )}
        </>
      )}

      <div className="equipment-tray">
        <div className="tray-heading">
          <strong>Current armor</strong>
          <span>Asset paths target <code>{raceCode}</code> with a Midlander fallback.</span>
        </div>
        <div className="equipment-slots">
          {ARMOR_SLOTS.map((slot) => {
            const item = equipped[slot]
            const plan = item ? equipmentAssetPlan(item, raceCode) : undefined
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
