import { useEffect, useState } from 'react'
import { xivapiIconUrl } from '../catalog/xivapi'
import { fetchHairstyles, type HairstyleOption } from '../customization/hairstyles'
import type { CharacterGender } from '../customization/types'

interface Props {
  tribeId: number
  gender: CharacterGender
  value: number
  onChange: (hairId: number) => void
}

export default function HairstylePicker({ tribeId, gender, value, onChange }: Props) {
  const [styles, setStyles] = useState<HairstyleOption[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const selected = styles.find((style) => style.hairId === value)
  const selectedLabel = selected ? `Style ${selected.customizeId}` : `Model ${value}`

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(undefined)
    setStyles([])
    void fetchHairstyles(tribeId, gender, controller.signal).then((next) => {
      if (controller.signal.aborted) return
      setStyles(next)
      setLoading(false)
      if (!next.some((style) => style.hairId === value)) onChange(next[0]!.hairId)
    }).catch((reason) => {
      if (controller.signal.aborted) return
      setLoading(false)
      setError(reason instanceof Error ? reason.message : 'Hairstyles could not be loaded.')
    })
    return () => controller.abort()
  }, [tribeId, gender]) // Changing style should not re-fetch the same menu.

  useEffect(() => {
    if (!open) return
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [open])

  return (
    <>
      <div className="customization-field hairstyle-field">
        <span>Hairstyle</span>
        <button type="button" className="hairstyle-current" onClick={() => setOpen(true)} disabled={loading}>
          {selected?.iconPath && <img src={xivapiIconUrl(selected.iconPath)} alt="" />}
          <b>{loading ? 'Loading…' : selectedLabel}</b>
          <small>{selected ? `Model h${selected.hairId.toString().padStart(4, '0')}` : 'Choose'}</small>
        </button>
        {error && <small className="hairstyle-error" title={error}>Catalog unavailable</small>}
      </div>

      {open && (
        <div className="hair-picker-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.currentTarget === event.target) setOpen(false)
        }}>
          <section className="hair-picker" role="dialog" aria-modal="true" aria-labelledby="hair-picker-title">
            <header>
              <div>
                <p className="eyebrow">Race-valid styles</p>
                <h2 id="hair-picker-title">Choose a hairstyle</h2>
                <p>{styles.length} compatible default and unlockable styles from current game data.</p>
              </div>
              <button type="button" className="catalog-picker-close" onClick={() => setOpen(false)} aria-label="Close hairstyle picker">×</button>
            </header>
            {error ? (
              <p className="catalog-error">{error}</p>
            ) : (
              <div className="hair-picker-grid">
                {styles.map((style) => (
                  <button
                    type="button"
                    className={style.hairId === value ? 'active' : ''}
                    key={style.customizeId}
                    onClick={() => { onChange(style.hairId); setOpen(false) }}
                    aria-pressed={style.hairId === value}
                    title={`Style ${style.customizeId} · model h${style.hairId.toString().padStart(4, '0')}${style.purchasable ? ' · unlockable' : ''}`}
                  >
                    {style.iconPath ? <img src={xivapiIconUrl(style.iconPath)} alt="" loading="lazy" /> : <span>?</span>}
                    <b>Style {style.customizeId}</b>
                    <small>Model {style.hairId}{style.purchasable ? ' · Unlockable' : ''}</small>
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </>
  )
}
