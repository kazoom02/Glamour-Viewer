import { useEffect, useMemo, useState } from 'react'
import { dyeCssColor, loadDyeCatalog, type DyeOption } from '../catalog/stains'
import type { EquipmentDye } from '../catalog/types'

interface Props {
  itemName: string
  channel: 0 | 1
  selected?: EquipmentDye | null
  onSelect: (dye: EquipmentDye | null) => void
  onClose: () => void
}

const SHADE_LABELS: Record<number, string> = {
  2: 'Neutral',
  4: 'Red',
  5: 'Brown & orange',
  6: 'Yellow',
  7: 'Green',
  8: 'Blue',
  9: 'Purple',
  10: 'Special & metallic',
}

export default function DyePicker({ itemName, channel, selected, onSelect, onClose }: Props) {
  const [dyes, setDyes] = useState<DyeOption[]>([])
  const [version, setVersion] = useState<string>()
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string>()

  useEffect(() => {
    let active = true
    void loadDyeCatalog().then((catalog) => {
      if (!active) return
      setDyes(catalog.dyes)
      setVersion(catalog.version)
    }).catch((reason) => {
      if (active) setError(reason instanceof Error ? reason.message : 'The dye catalog could not be loaded.')
    })
    const closeOnEscape = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      active = false
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [onClose])

  const groups = useMemo(() => {
    const term = query.trim().toLocaleLowerCase()
    const filtered = term ? dyes.filter((dye) => dye.name.toLocaleLowerCase().includes(term)) : dyes
    const byShade = new Map<number, DyeOption[]>()
    filtered.forEach((dye) => byShade.set(dye.shade, [...(byShade.get(dye.shade) ?? []), dye]))
    return [...byShade.entries()]
  }, [dyes, query])

  return (
    <div className="dye-picker-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="dye-picker" role="dialog" aria-modal="true" aria-labelledby="dye-picker-title">
        <header>
          <div>
            <p className="eyebrow">Dye channel {channel + 1}</p>
            <h2 id="dye-picker-title">Choose a color</h2>
            <p>{itemName} · colors from XIVAPI, rendering from your local staining templates.</p>
          </div>
          <div className="dye-picker-header-actions">
            {version && <span>Game data {version.slice(0, 8)}</span>}
            <button className="catalog-picker-close" type="button" onClick={onClose} aria-label="Close dye picker">×</button>
          </div>
        </header>
        <label className="dye-search">
          <span className="field-label">Search dyes</span>
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Slate Grey, Jet Black, Pure White…" autoFocus />
        </label>
        {error && <p className="error-message" role="alert">{error}</p>}
        {!error && !dyes.length && <p className="catalog-loading-status" role="status">Loading every FFXIV dye…</p>}
        <div className="dye-groups">
          {groups.map(([shade, options]) => (
            <section className="dye-group" key={shade}>
              <h3>{SHADE_LABELS[shade] ?? `Color group ${shade}`}</h3>
              <div className="dye-grid">
                {options.map((dye) => {
                  const active = (selected?.id ?? 0) === dye.id
                  return (
                    <button
                      className={`${active ? 'active ' : ''}${dye.metallic ? 'metallic' : ''}`}
                      type="button"
                      key={dye.id}
                      onClick={() => onSelect(dye.id === 0 ? null : { id: dye.id, name: dye.name, color: dye.color })}
                      title={`${dye.name}${dye.metallic ? ' · metallic' : ''}`}
                    >
                      <i className={dye.id === 0 ? 'no-dye' : ''} style={dye.id === 0 ? undefined : { backgroundColor: dyeCssColor(dye.color) }} />
                      <span>{dye.name}</span>
                    </button>
                  )
                })}
              </div>
            </section>
          ))}
          {dyes.length > 0 && groups.length === 0 && <p className="catalog-loading-status">No dyes match “{query}”.</p>}
        </div>
      </section>
    </div>
  )
}
