import { type FormEvent, useEffect, useRef, useState } from 'react'
import type { AssetSource } from '../asset-source/types'
import {
  EQUIPMENT_SLOTS,
  SLOT_LABELS,
  type ArmorItem,
  type EquipmentDye,
  type EquipmentSlot,
  type EquippedArmor,
} from '../catalog/types'
import { dyeCssColor } from '../catalog/stains'
import { continueArmorSearch, searchArmor, xivapiIconUrl } from '../catalog/xivapi'
import DyePicker from './DyePicker'

interface Props {
  source: AssetSource
  equipped: EquippedArmor
  onEquip: (item: ArmorItem) => void
  onRemove: (slot: EquipmentSlot) => void
  onDye: (slot: EquipmentSlot, channel: 0 | 1, dye: EquipmentDye | null) => void
}

const LEFT_SLOTS: EquipmentSlot[] = ['mainHand', 'head', 'body', 'hands', 'legs', 'feet']
const RIGHT_SLOTS: EquipmentSlot[] = ['offHand', 'ears', 'neck', 'wrists', 'rightRing', 'leftRing']
const SLOT_GLYPHS: Record<EquipmentSlot, string> = {
  mainHand: '⚔', offHand: '◈', head: '⌃', body: '◇', hands: '✦', legs: 'Ⅱ', feet: '⌄',
  ears: '◉', neck: '◡', wrists: '◌', rightRing: '○', leftRing: '○',
}

export default function ArmorCatalog({ source, equipped, onEquip, onRemove, onDye }: Props) {
  const [query, setQuery] = useState('')
  const [selectedSlot, setSelectedSlot] = useState<EquipmentSlot | null>(null)
  const [results, setResults] = useState<ArmorItem[]>([])
  const [pagesLoaded, setPagesLoaded] = useState(0)
  const [version, setVersion] = useState<string>()
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [dyePicker, setDyePicker] = useState<{ slot: EquipmentSlot; channel: 0 | 1 } | null>(null)
  const abortRef = useRef<AbortController>(null)

  async function loadCatalog(search: string, slot: EquipmentSlot) {
    abortRef.current?.abort()
    const controller = new AbortController()
    const itemsById = new Map<number, ArmorItem>()
    const seenCursors = new Set<string>()
    abortRef.current = controller
    setBusy(true)
    setError(undefined)
    setResults([])
    setPagesLoaded(0)
    try {
      let page = await searchArmor(search, slot, controller.signal)
      let loadedPages = 0
      while (true) {
        if (controller.signal.aborted) return
        loadedPages += 1
        page.items.forEach((item) => itemsById.set(item.id, item))
        setResults([...itemsById.values()])
        setPagesLoaded(loadedPages)
        setVersion(page.version)
        const cursor = page.next
        if (!cursor) break
        if (seenCursors.has(cursor)) throw new Error('XIVAPI returned a repeated catalog cursor.')
        seenCursors.add(cursor)
        page = await continueArmorSearch(cursor, slot, controller.signal)
      }
      if (!itemsById.size) setError(`No ${SLOT_LABELS[slot].toLowerCase()} items matched that search.`)
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') return
      const message = caught instanceof Error ? caught.message : 'The equipment catalog could not be searched.'
      setError(itemsById.size ? `${itemsById.size} items loaded before the catalog stopped: ${message}` : message)
    } finally {
      if (abortRef.current === controller) setBusy(false)
    }
  }

  function openSlot(slot: EquipmentSlot) {
    setQuery('')
    setSelectedSlot(slot)
  }

  function closePicker() {
    abortRef.current?.abort()
    setSelectedSlot(null)
  }

  useEffect(() => {
    if (!selectedSlot) return
    void loadCatalog('', selectedSlot)
    return () => abortRef.current?.abort()
  }, [selectedSlot])

  useEffect(() => {
    if (!selectedSlot) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closePicker()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [selectedSlot])

  function submit(event: FormEvent) {
    event.preventDefault()
    if (selectedSlot) void loadCatalog(query, selectedSlot)
  }

  function equip(item: ArmorItem) {
    onEquip(item)
    closePicker()
  }

  function SlotButton({ slot }: { slot: EquipmentSlot }) {
    const item = equipped[slot]
    const channelCount = Math.min(2, item?.dyeCount ?? 0)
    return (
      <div className={`dressing-slot ${item ? 'filled' : ''}`}>
        <button type="button" className="dressing-slot-main" onClick={() => openSlot(slot)}>
          <span className="dressing-slot-icon">
            {item?.iconPath
              ? <img src={xivapiIconUrl(item.iconPath)} alt="" loading="lazy" />
              : <b aria-hidden="true">{SLOT_GLYPHS[slot]}</b>}
          </span>
          <span className="dressing-slot-copy">
            <small>{SLOT_LABELS[slot]}</small>
            <strong>{item?.name ?? 'Choose item'}</strong>
          </span>
        </button>
        {item && (
          <button className="dressing-slot-remove" type="button" onClick={() => onRemove(slot)} aria-label={`Unequip ${item.name}`} title="Unequip">×</button>
        )}
        {item && channelCount > 0 && (
          <div className="dressing-slot-dyes" aria-label={`${item.name} dyes`}>
            {Array.from({ length: channelCount }, (_, channel) => {
              const dye = item.dyes?.[channel]
              return (
                <button
                  className={dye ? 'applied' : ''}
                  type="button"
                  key={channel}
                  disabled={source.kind !== 'local'}
                  onClick={() => setDyePicker({ slot, channel: channel as 0 | 1 })}
                  title={source.kind === 'local' ? `Change dye channel ${channel + 1}` : 'Accurate dye preview requires Local install mode'}
                >
                  <i style={dye ? { backgroundColor: dyeCssColor(dye.color) } : undefined} />
                  <span>{dye?.name ?? `Dye ${channel + 1}`}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  return (
    <section className="catalog-section dressing-room" aria-labelledby="catalog-title">
      <div className="catalog-heading">
        <div>
          <p className="eyebrow">Dressing room</p>
          <h2 id="catalog-title">Click a slot to change it</h2>
          <p>Names and icons come from XIVAPI. Models and textures are read directly from <strong>{source.label}</strong>.</p>
        </div>
        {version && <span className="catalog-version">Game data {version.slice(0, 8)}</span>}
      </div>

      <div className="dressing-layout" aria-label="Equipment slots">
        <div className="dressing-rail">{LEFT_SLOTS.map((slot) => <SlotButton slot={slot} key={slot} />)}</div>
        <div className="dressing-figure" aria-hidden="true">
          <span />
          <strong>{Object.values(equipped).filter(Boolean).length}</strong>
          <small>items equipped</small>
        </div>
        <div className="dressing-rail">{RIGHT_SLOTS.map((slot) => <SlotButton slot={slot} key={slot} />)}</div>
      </div>

      <p className="dressing-help">Select any slot to open its complete searchable catalog. Use × to unequip an item.</p>

      {selectedSlot && (
        <div className="catalog-picker-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closePicker()}>
          <section className="catalog-picker" role="dialog" aria-modal="true" aria-labelledby="picker-title">
            <header className="catalog-picker-header">
              <div>
                <p className="eyebrow">Equipment picker</p>
                <h2 id="picker-title">{SLOT_LABELS[selectedSlot]}</h2>
              </div>
              <div className="catalog-picker-actions">
                {equipped[selectedSlot] && <button className="button secondary" type="button" onClick={() => onRemove(selectedSlot)}>Unequip</button>}
                <button className="catalog-picker-close" type="button" onClick={closePicker} aria-label="Close equipment picker">×</button>
              </div>
            </header>

            <form className="catalog-search" onSubmit={submit}>
              <label className="field-label" htmlFor="equipment-search">Search {SLOT_LABELS[selectedSlot]}</label>
              <div className="url-row">
                <input
                  id="equipment-search"
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={`Search ${SLOT_LABELS[selectedSlot].toLowerCase()}, or leave empty to show everything`}
                  autoComplete="off"
                  autoFocus
                />
                <button className="button primary" disabled={query.trim().length === 1}>
                  {busy ? 'Restart search' : query.trim() ? 'Search' : 'Show everything'}
                </button>
              </div>
            </form>

            {error && <p className="error-message catalog-error" role="alert">{error}</p>}
            {busy && results.length === 0 && <p className="catalog-loading-status" role="status">Loading the complete catalog…</p>}
            {results.length > 0 && (
              <>
                <div className="catalog-results-heading">
                  <strong>{results.length} {results.length === 1 ? 'item' : 'items'}</strong>
                  <span>{pagesLoaded} {pagesLoaded === 1 ? 'page' : 'pages'}{busy ? ' · loading remaining pages…' : ' · complete'}</span>
                </div>
                <div className="armor-results picker-results" aria-label={`${SLOT_LABELS[selectedSlot]} results`}>
                  {results.map((item) => {
                    const isEquipped = equipped[selectedSlot]?.id === item.id
                    return (
                      <article className="armor-result" key={item.id}>
                        <div className="armor-icon">
                          {item.iconPath ? <img src={xivapiIconUrl(item.iconPath)} alt="" loading="lazy" /> : <span>—</span>}
                        </div>
                        <div className="armor-copy">
                          <span>Level {item.equipLevel}</span>
                          <strong>{item.name}</strong>
                          <small>{item.jobs} · Model {item.modelSet.toString().padStart(4, '0')}{item.modelBase ? `/${item.modelBase.toString().padStart(4, '0')}` : ''} v{item.modelVariant.toString().padStart(4, '0')}</small>
                        </div>
                        <button
                          className={`button ${isEquipped ? 'equipped' : 'secondary'}`}
                          type="button"
                          onClick={() => isEquipped ? onRemove(selectedSlot) : equip(item)}
                        >
                          {isEquipped ? 'Unequip' : 'Equip'}
                        </button>
                      </article>
                    )
                  })}
                </div>
              </>
            )}
          </section>
        </div>
      )}
      {dyePicker && equipped[dyePicker.slot] && (
        <DyePicker
          itemName={equipped[dyePicker.slot]!.name}
          channel={dyePicker.channel}
          selected={equipped[dyePicker.slot]!.dyes?.[dyePicker.channel]}
          onSelect={(dye) => {
            onDye(dyePicker.slot, dyePicker.channel, dye)
            setDyePicker(null)
          }}
          onClose={() => setDyePicker(null)}
        />
      )}
    </section>
  )
}

export { EQUIPMENT_SLOTS }
