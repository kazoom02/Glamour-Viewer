import { useEffect, useMemo, useRef, useState } from 'react'
import type { AssetSource } from '../asset-source/types'
import {
  EQUIPMENT_SLOTS,
  isWeaponSlot,
  SLOT_LABELS,
  type ArmorItem,
  type EquipmentDye,
  type EquipmentSlot,
  type EquippedArmor,
  type HairVisibility,
  type WeaponPlacement,
  type WeaponSlot,
} from '../catalog/types'
import { dyeCssColor } from '../catalog/stains'
import { JOB_FILTERS, xivapiIconUrl } from '../catalog/xivapi'
import {
  catalogDataVersion,
  getClassJobCategories,
  getSlotCatalog,
  isSlotCached,
  prefetchAllSlots,
} from '../catalog/catalogCache'
import DyePicker from './DyePicker'



interface Props {
  source: AssetSource
  equipped: EquippedArmor
  onEquip: (item: ArmorItem) => void
  onRemove: (slot: EquipmentSlot) => void
  onDye: (slot: EquipmentSlot, channel: 0 | 1, dye: EquipmentDye | null) => void
  onHeadHairVisibility: (visibility: HairVisibility) => void
  onWeaponPlacement: (slot: WeaponSlot, placement: WeaponPlacement) => void
}

const LEFT_SLOTS: EquipmentSlot[] = ['mainHand', 'head', 'body', 'hands', 'legs', 'feet']
const RIGHT_SLOTS: EquipmentSlot[] = ['offHand', 'ears', 'neck', 'wrists', 'rightRing', 'leftRing']
const SLOT_GLYPHS: Record<EquipmentSlot, string> = {
  mainHand: '⚔', offHand: '◈', head: '⌃', body: '◇', hands: '✦', legs: 'Ⅱ', feet: '⌄',
  ears: '◉', neck: '◡', wrists: '◌', rightRing: '○', leftRing: '○',
}

type SortMode = 'ilvl-desc' | 'ilvl-asc' | 'name'

// Class filter options grouped by role, in the order players expect.
const JOB_GROUP_ORDER = ['Tank', 'Healer', 'Melee', 'Ranged', 'Caster', 'Crafter', 'Gatherer']
const JOB_GROUPS = JOB_GROUP_ORDER.map((group) => ({
  group,
  jobs: JOB_FILTERS.filter((job) => job.group === group),
})).filter((entry) => entry.jobs.length > 0)

export default function ArmorCatalog({ source, equipped, onEquip, onRemove, onDye, onHeadHairVisibility, onWeaponPlacement }: Props) {
  const [query, setQuery] = useState('')
  const [selectedSlot, setSelectedSlot] = useState<EquipmentSlot | null>(null)
  const [fullItems, setFullItems] = useState<ArmorItem[]>([])
  const [pagesLoaded, setPagesLoaded] = useState(0)
  const [loading, setLoading] = useState(false)
  const [cached, setCached] = useState(false)
  const [version, setVersion] = useState<string>()
  const [error, setError] = useState<string>()
  const [sortMode, setSortMode] = useState<SortMode>('ilvl-desc')
  const [jobFilter, setJobFilter] = useState('')
  const [categories, setCategories] = useState<Map<number, Set<string>> | null>(null)
  const [dyePicker, setDyePicker] = useState<{ slot: EquipmentSlot; channel: 0 | 1 } | null>(null)










  // Warm the whole catalog + class lookup once, in the background.
  useEffect(() => {
    prefetchAllSlots()
    let active = true
    getClassJobCategories()
      .then((map) => { if (active) setCategories(map) })
      .catch(() => { /* class filter simply stays permissive if this fails */ })
    return () => { active = false }
  }, [])

  // Load the selected slot's full catalog from cache (fetched at most once).
  useEffect(() => {
    if (!selectedSlot) return
    let active = true
    const alreadyCached = isSlotCached(selectedSlot)
    setError(undefined)
    setFullItems([])
    setPagesLoaded(0)
    setCached(alreadyCached)
    setLoading(!alreadyCached)
    getSlotCatalog(selectedSlot, {
      onProgress: (items, pages) => {
        if (!active) return
        setFullItems(items)
        if (pages >= 0) setPagesLoaded(pages)
      },
    })
      .then((items) => {
        if (!active) return
        setFullItems(items)
        setLoading(false)
        setCached(true)
        setVersion(catalogDataVersion())
        if (items.length === 0) setError(`No ${SLOT_LABELS[selectedSlot].toLowerCase()} items are available.`)
      })
      .catch((reason) => {
        if (!active) return
        setLoading(false)
        setError(reason instanceof Error ? reason.message : 'The equipment catalog could not be loaded.')
      })
    return () => { active = false }
  }, [selectedSlot])

  useEffect(() => {
    if (!selectedSlot) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedSlot(null)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [selectedSlot])

  const displayed = useMemo(() => {
    let list = fullItems
    const term = query.trim().toLowerCase()
    if (term.length >= 2) list = list.filter((item) => item.name.toLowerCase().includes(term))
    if (jobFilter) {
      const columns = JOB_FILTERS.find((job) => job.code === jobFilter)?.columns ?? []
      list = list.filter((item) => {
        if (!item.classJobCategoryId) return true
        const enabled = categories?.get(item.classJobCategoryId)
        if (!enabled) return true
        return columns.some((column) => enabled.has(column))
      })
    }
    const sorted = [...list]
    const ilvl = (item: ArmorItem) => item.itemLevel ?? 0
    if (sortMode === 'ilvl-desc') sorted.sort((a, b) => ilvl(b) - ilvl(a) || a.name.localeCompare(b.name))
    else if (sortMode === 'ilvl-asc') sorted.sort((a, b) => ilvl(a) - ilvl(b) || a.name.localeCompare(b.name))
    else sorted.sort((a, b) => a.name.localeCompare(b.name))
    return sorted
  }, [fullItems, query, jobFilter, sortMode, categories])

  function openSlot(slot: EquipmentSlot) {
    setQuery('')
    setJobFilter('')
    setSelectedSlot(slot)
  }

  function closePicker() {
    setSelectedSlot(null)
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
        {item && slot === 'head' && (
          <label className="dressing-slot-hair">
            <span>Hair</span>
            <select
              value={item.headHairVisibility ?? 'auto'}
              onChange={(event) => onHeadHairVisibility(event.target.value as HairVisibility)}
              aria-label="Hair visibility with head equipment"
            >
              <option value="auto">Auto (game setting)</option>
              <option value="hide">Hide hair</option>
              <option value="show">Show hair</option>
            </select>
          </label>
        )}
        {item && (
          <div className="item-hover-menu">
            <a className="item-hover-link" href={`https://ffxiv.consolegameswiki.com/wiki/${encodeURIComponent(item.name.replace(/ /g, '_'))}`} target="_blank" rel="noopener noreferrer">Wiki ↗</a>
            <a className="item-hover-link" href={`https://universalis.app/market/${item.id}`} target="_blank" rel="noopener noreferrer">Universalis ↗</a>
          </div>
        )}
        {item && isWeaponSlot(slot) && (
          <label className="dressing-slot-placement">
            <span>Placement</span>
            <select
              value={item.weaponPlacement ?? 'hand'}
              onChange={(event) => onWeaponPlacement(slot, event.target.value as WeaponPlacement)}
              aria-label={`${SLOT_LABELS[slot]} placement`}
            >
              <option value="hand">In hand</option>
              <option value="back">On back</option>
            </select>
          </label>
        )}
      </div>
    )
  }

  return (
    <section className="catalog-section dressing-room" aria-label="Dressing room">
      {version && (
        <div className="catalog-heading">
          <span className="catalog-version">Game data {version.slice(0, 8)}</span>
        </div>
      )}

      <div className="dressing-layout" aria-label="Equipment slots">
        <div className="dressing-rail">{LEFT_SLOTS.map((slot) => <SlotButton slot={slot} key={slot} />)}</div>
        <div className="dressing-figure" aria-hidden="true">
          <span />
          <strong>{Object.values(equipped).filter(Boolean).length}</strong>
          <small>items equipped</small>
        </div>
        <div className="dressing-rail">{RIGHT_SLOTS.map((slot) => <SlotButton slot={slot} key={slot} />)}</div>
      </div>

      <p className="dressing-help">Select any slot to open its catalog. Each slot loads once, then search, sort and class filters are instant. Use × to unequip an item.</p>

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

            <div className="catalog-controls">
              <div className="catalog-field catalog-field-search">
                <label className="field-label" htmlFor="equipment-search">Search</label>
                <input
                  id="equipment-search"
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={`Filter ${SLOT_LABELS[selectedSlot].toLowerCase()} by name`}
                  autoComplete="off"
                  autoFocus
                />
              </div>
              <div className="catalog-field">
                <label className="field-label" htmlFor="equipment-sort">Sort</label>
                <select id="equipment-sort" value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}>
                  <option value="ilvl-desc">Item level (high → low)</option>
                  <option value="ilvl-asc">Item level (low → high)</option>
                  <option value="name">Name (A → Z)</option>
                </select>
              </div>
              <div className="catalog-field">
                <label className="field-label" htmlFor="equipment-class">Class</label>
                <select id="equipment-class" value={jobFilter} onChange={(event) => setJobFilter(event.target.value)}>
                  <option value="">All classes</option>
                  {JOB_GROUPS.map(({ group, jobs }) => (
                    <optgroup key={group} label={group}>
                      {jobs.map((job) => (
                        <option key={job.code} value={job.code}>{job.label} ({job.code})</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              
            </div>

            {error && <p className="error-message catalog-error" role="alert">{error}</p>}
            {loading && fullItems.length === 0 && <p className="catalog-loading-status" role="status">Loading the complete catalog…</p>}

            {fullItems.length > 0 && (
              <>
                <div className="catalog-results-heading">
                  <strong>{displayed.length} {displayed.length === 1 ? 'item' : 'items'}</strong>
                  <span>
                    {loading
                      ? `loading… ${pagesLoaded} ${pagesLoaded === 1 ? 'page' : 'pages'}`
                      : `${fullItems.length} total · ${cached ? 'cached' : 'loaded'}`}
                    {jobFilter ? ` · ${JOB_FILTERS.find((job) => job.code === jobFilter)?.label ?? jobFilter}` : ''}
                  </span>
                </div>
                {displayed.length === 0 ? (
                  <p className="catalog-loading-status" role="status">No items match the current search and filters.</p>
                ) : (
                  <div className="armor-results picker-results" aria-label={`${SLOT_LABELS[selectedSlot]} results`}>
                    {displayed.map((item) => {
                      const isEquipped = equipped[selectedSlot]?.id === item.id
                      return (
                        <article
                          className="armor-result"
                          key={item.id}
                        >
                          <div className="armor-icon">
                            {item.iconPath ? <img src={xivapiIconUrl(item.iconPath)} alt="" loading="lazy" /> : <span>—</span>}
                          </div>
                          <div className="armor-copy">
                            <span>{item.itemLevel ? `i${item.itemLevel} · ` : ''}Lv {item.equipLevel}</span>
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
                )}
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
