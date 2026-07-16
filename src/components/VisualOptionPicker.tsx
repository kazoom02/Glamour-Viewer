import { useEffect, useId, useState } from 'react'
import { xivapiIconUrl } from '../catalog/xivapi'

export interface VisualPickerOption<T extends string | number> {
  value: T
  label: string
  detail?: string
  iconPath?: string
  badge?: string
}

interface PickerProps<T extends string | number> {
  label: string
  value: T
  options: VisualPickerOption<T>[]
  onChange: (value: T) => void
  loading?: boolean
  error?: string
  eyebrow?: string
}

export function VisualOptionPicker<T extends string | number>({
  label,
  value,
  options,
  onChange,
  loading = false,
  error,
  eyebrow = 'Character creator options',
}: PickerProps<T>) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const selected = options.find((option) => option.value === value)

  useEffect(() => {
    if (!open) return
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [open])

  const preview = (option: VisualPickerOption<T> | undefined, large = false) => option?.iconPath
    ? <img src={xivapiIconUrl(option.iconPath)} alt="" loading={large ? 'lazy' : undefined} />
    : <span className="visual-option-placeholder" aria-hidden="true">{option?.badge ?? option?.label.slice(0, 2).toUpperCase() ?? '?'}</span>

  return (
    <>
      <div className="customization-field visual-picker-field">
        <span>{label}</span>
        <button type="button" className="visual-picker-current" onClick={() => setOpen(true)} disabled={loading || !options.length}>
          {preview(selected)}
          <b>{loading ? 'Loading…' : selected?.label ?? `Choose ${label.toLowerCase()}`}</b>
          <small>{error ? 'Fallback catalog' : selected?.detail ?? `${options.length} choices`}</small>
        </button>
      </div>

      {open && (
        <div className="hair-picker-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.currentTarget === event.target) setOpen(false)
        }}>
          <section className="hair-picker visual-picker-dialog" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`}>
            <header>
              <div>
                <p className="eyebrow">{eyebrow}</p>
                <h2 id={`${id}-title`}>Choose {label.toLowerCase()}</h2>
                <p>{options.length} options valid for the selected race, tribe, and gender.</p>
              </div>
              <button type="button" className="catalog-picker-close" onClick={() => setOpen(false)} aria-label={`Close ${label} picker`}>×</button>
            </header>
            {error && <p className="visual-picker-warning" title={error}>Live icons are unavailable; the valid fallback choices are shown.</p>}
            <div className="hair-picker-grid visual-picker-grid">
              {options.map((option) => (
                <button
                  type="button"
                  className={option.value === value ? 'active' : ''}
                  key={String(option.value)}
                  onClick={() => { onChange(option.value); setOpen(false) }}
                  aria-pressed={option.value === value}
                >
                  {preview(option, true)}
                  <b>{option.label}</b>
                  <small>{option.detail ?? `Value ${option.value}`}</small>
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
    </>
  )
}

interface BitmaskProps {
  label: string
  value: number
  count: number
  onChange: (value: number) => void
}

export function VisualBitmaskPicker({ label, value, count, onChange }: BitmaskProps) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const selectedCount = Array.from({ length: count }, (_, index) => (value & (1 << index)) !== 0).filter(Boolean).length

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
      <div className="customization-field visual-picker-field">
        <span>{label}</span>
        <button type="button" className="visual-picker-current" onClick={() => setOpen(true)}>
          <span className="visual-option-placeholder feature-summary" aria-hidden="true">{selectedCount}</span>
          <b>{selectedCount ? `${selectedCount} selected` : 'None'}</b>
          <small>Choose any combination</small>
        </button>
      </div>
      {open && (
        <div className="hair-picker-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.currentTarget === event.target) setOpen(false)
        }}>
          <section className="hair-picker visual-picker-dialog compact" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`}>
            <header>
              <div>
                <p className="eyebrow">Native face submeshes</p>
                <h2 id={`${id}-title`}>Choose {label.toLowerCase()}</h2>
                <p>These options can be combined, matching the in-game checkboxes.</p>
              </div>
              <button type="button" className="catalog-picker-close" onClick={() => setOpen(false)} aria-label={`Close ${label} picker`}>×</button>
            </header>
            <div className="hair-picker-grid visual-picker-grid feature-picker-grid">
              {Array.from({ length: count }, (_, index) => {
                const active = (value & (1 << index)) !== 0
                return (
                  <button
                    type="button"
                    className={active ? 'active' : ''}
                    key={index}
                    onClick={() => onChange(active ? value & ~(1 << index) : value | (1 << index))}
                    aria-pressed={active}
                  >
                    <span className={`face-feature-preview feature-${index + 1}`} aria-hidden="true"><i /></span>
                    <b>{label.replace(/s$/, '')} {index + 1}</b>
                    <small>{active ? 'Enabled' : 'Disabled'}</small>
                  </button>
                )
              })}
            </div>
            <footer className="visual-picker-footer">
              <button type="button" onClick={() => onChange(0)}>Clear all</button>
              <button type="button" className="primary" onClick={() => setOpen(false)}>Done</button>
            </footer>
          </section>
        </div>
      )}
    </>
  )
}
