import { useEffect, useMemo, useState } from 'react'
import {
  ANIMATION_CATEGORIES,
  loadAnimationCatalog,
  type AnimationCategory,
  type CatalogAnimation,
} from '../asset-source/animationCatalog'

interface AnimationPickerProps {
  /** Catalog id of the animation currently loaded on the character, if any. */
  activeId?: string
  /** Human label of the active animation, shown when the panel is minimized. */
  activeLabel?: string
  /** True while the selected animation is decoding. */
  busy?: boolean
  /** Status or error text from the parent (decode failures, additive notices). */
  notice?: string
  /** One-line binding diagnostic from the parent (name/index, bound tracks). */
  debug?: string
  onSelect: (entry: CatalogAnimation) => void
}

// Rendering every match would put hundreds of buttons in the DOM; the list is
// capped and the count invites the user to narrow with the class filter/search.
const MAX_ROWS = 250

export default function AnimationPicker({ activeId, activeLabel, busy, notice, debug, onSelect }: AnimationPickerProps) {
  const [catalog, setCatalog] = useState<CatalogAnimation[]>()
  const [loadError, setLoadError] = useState<string>()
  const [category, setCategory] = useState<AnimationCategory>('idle')
  const [weaponClass, setWeaponClass] = useState('bt_common')
  const [query, setQuery] = useState('')
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    let cancelled = false
    loadAnimationCatalog()
      .then((entries) => { if (!cancelled) setCatalog(entries) })
      .catch((reason) => { if (!cancelled) setLoadError(reason instanceof Error ? reason.message : 'Catalog failed to load.') })
    return () => { cancelled = true }
  }, [])

  const weaponClasses = useMemo(() => {
    if (!catalog) return []
    const seen = new Map<string, string>()
    for (const entry of catalog) if (!seen.has(entry.weaponClass)) seen.set(entry.weaponClass, entry.weaponLabel)
    return [...seen.entries()]
      .map(([code, label]) => ({ code, label }))
      .sort((a, b) => (a.code === 'bt_common' ? -1 : b.code === 'bt_common' ? 1 : a.label.localeCompare(b.label)))
  }, [catalog])

  const matches = useMemo(() => {
    if (!catalog) return []
    const q = query.trim().toLowerCase()
    return catalog.filter((entry) => (
      entry.category === category
      && (weaponClass === 'all' || entry.weaponClass === weaponClass)
      && (!q || entry.label.toLowerCase().includes(q) || entry.id.toLowerCase().includes(q))
    ))
  }, [catalog, category, weaponClass, query])

  const rows = matches.slice(0, MAX_ROWS)

  return (
    <div className={`anim-picker${collapsed ? ' collapsed' : ''}`} aria-label="Animation catalog">
      <div className="anim-picker-head">
        <span className="anim-picker-title" title={activeLabel || 'Animations'}>
          {collapsed ? (activeLabel || 'Animations') : 'Animations'}
        </span>
        <button
          type="button"
          className="anim-picker-toggle"
          aria-expanded={!collapsed}
          title={collapsed ? 'Expand animations menu' : 'Minimize animations menu'}
          onClick={() => setCollapsed((value) => !value)}
        >
          {collapsed ? '▢' : '—'}
        </button>
      </div>

      {collapsed ? null : loadError ? (
        <p className="anim-picker-note" role="status">Animation catalog unavailable: {loadError}</p>
      ) : !catalog ? (
        <p className="anim-picker-note" role="status">Loading animation catalog…</p>
      ) : (
        <>
      <div className="anim-picker-cats" role="tablist" aria-label="Animation categories">
        {ANIMATION_CATEGORIES.map(({ id, label, advanced }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={id === category}
            className={`${id === category ? 'active' : ''}${advanced ? ' advanced' : ''}`}
            onClick={() => setCategory(id)}
            title={advanced ? 'Combat and cutscene clips are often additive overlays and may not play as a standing pose.' : undefined}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="anim-picker-filters">
        <label>
          <span className="visually-hidden">Weapon class</span>
          <select value={weaponClass} onChange={(event) => setWeaponClass(event.target.value)}>
            <option value="all">All weapon classes</option>
            {weaponClasses.map(({ code, label }) => (
              <option key={code} value={code}>{label}</option>
            ))}
          </select>
        </label>
        <input
          type="search"
          value={query}
          placeholder="Search animations…"
          aria-label="Search animations"
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {notice && <p className="anim-picker-note" role="status">{notice}</p>}

      <div className="anim-picker-list" role="listbox" aria-label="Animations" aria-busy={busy}>
        {rows.length === 0 && <p className="anim-picker-note">No animations match this filter.</p>}
        {rows.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="option"
            aria-selected={entry.id === activeId}
            className={entry.id === activeId ? 'active' : ''}
            disabled={busy}
            onClick={() => onSelect(entry)}
            title={entry.id}
          >
            <span className="anim-name">{entry.label}</span>
            {weaponClass === 'all' && entry.weaponClass !== 'bt_common' && (
              <span className="anim-class">{entry.weaponLabel}</span>
            )}
          </button>
        ))}
      </div>

      {matches.length > rows.length && (
        <p className="anim-picker-note">
          Showing {rows.length} of {matches.length}. Narrow with the class filter or search.
        </p>
      )}
        </>
      )}

      {!collapsed && debug && (
        <details className="anim-picker-debug">
          <summary>Animation debug</summary>
          <code>{debug}</code>
        </details>
      )}
    </div>
  )
}
