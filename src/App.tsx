import { lazy, Suspense, useEffect, useState, type FormEvent } from 'react'
import type { AssetSource } from './asset-source/types'
import { HostedAssetsPanel } from './components/HostedAssetsPanel'
import { LocalInstallPanel } from './components/LocalInstallPanel'
import { formatBytes } from './lib/format'
import {
  createSharedSet,
  equippedFromSharedSet,
  parseSharedSet,
  readSharedSet,
  sharedSetHash,
  type SharedSet,
} from './lib/share'
import type {
  ArmorItem,
  EquipmentDye,
  EquipmentSlot,
  EquippedArmor,
  HairVisibility,
  WeaponPlacement,
  WeaponSlot,
} from './catalog/types'
import { CHARACTER_PRESETS, type CharacterRaceCode } from './asset-source/characterPlan'
import { customizationForRaceCode, type CharacterCustomization } from './customization/types'

const ViewerCanvas = lazy(() => import('./viewer/ViewerCanvas'))
const DefaultCharacterPreview = lazy(() => import('./viewer/DefaultCharacterPreview'))
const ArmorCatalog = lazy(() => import('./components/ArmorCatalog'))
const CustomizationPanel = lazy(() => import('./components/CustomizationPanel'))

export function App() {
  const [source, setSource] = useState<AssetSource>()
  const [sharedSet, setSharedSet] = useState<SharedSet | null>(() => readSharedSet())
  const [copied, setCopied] = useState(false)
  const [shareInput, setShareInput] = useState('')
  const [shareNotice, setShareNotice] = useState<string>()
  const [shareError, setShareError] = useState<string>()
  const [equipped, setEquipped] = useState<EquippedArmor>(() => sharedSet ? equippedFromSharedSet(sharedSet) : {})
  const [raceCode, setRaceCode] = useState<CharacterRaceCode>(() => sharedSet?.raceCode ?? 'c0201')
  const [customization, setCustomization] = useState<CharacterCustomization>(() => customizationForRaceCode(sharedSet?.raceCode ?? 'c0201'))
  const [workspaceTab, setWorkspaceTab] = useState<'dressing' | 'customization'>('dressing')

  useEffect(() => {
    setCustomization((current) => customizationForRaceCode(raceCode, current))
  }, [raceCode])

  useEffect(() => {
    const onHashChange = () => {
      const set = readSharedSet()
      setSharedSet(set)
      if (set) {
        setRaceCode(set.raceCode)
        setEquipped(equippedFromSharedSet(set))
        setShareNotice('Shared recipe imported.')
        setShareError(undefined)
      }
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  function applySharedSet(set: SharedSet) {
    setSharedSet(set)
    setRaceCode(set.raceCode)
    setEquipped(equippedFromSharedSet(set))
    setShareNotice('Shared recipe imported.')
    setShareError(undefined)
  }

  async function shareCurrentLook() {
    if (!Object.values(equipped).some(Boolean)) {
      setShareError('Equip at least one item before creating a share link.')
      return
    }
    const set = createSharedSet(raceCode, equipped)
    setSharedSet(set)
    window.location.hash = sharedSetHash(set)
    setShareError(undefined)
    try {
      if (!navigator.clipboard) throw new Error('Clipboard access is unavailable.')
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setShareNotice('Current look link copied.')
    } catch {
      setShareNotice('The share link is ready in the address bar; copy it from there.')
    }
    window.setTimeout(() => setCopied(false), 1800)
  }

  function importSharedLink(event: FormEvent) {
    event.preventDefault()
    const set = parseSharedSet(shareInput)
    if (!set) {
      setShareNotice(undefined)
      setShareError('That is not a valid Glamour Viewer share link.')
      return
    }
    applySharedSet(set)
    window.location.hash = sharedSetHash(set)
  }

  function equip(item: ArmorItem) {
    setEquipped((current) => ({ ...current, [item.slot]: item }))
  }

  function unequip(slot: ArmorItem['slot']) {
    setEquipped((current) => {
      const next = { ...current }
      delete next[slot]
      return next
    })
  }

  function dyeEquipment(slot: EquipmentSlot, channel: 0 | 1, dye: EquipmentDye | null) {
    setEquipped((current) => {
      const item = current[slot]
      if (!item || channel >= Math.min(2, item.dyeCount)) return current
      const dyes: [EquipmentDye | null, EquipmentDye | null] = [
        item.dyes?.[0] ?? null,
        item.dyes?.[1] ?? null,
      ]
      dyes[channel] = dye
      return { ...current, [slot]: { ...item, dyes } }
    })
  }

  function setHeadHairVisibility(visibility: HairVisibility) {
    setEquipped((current) => current.head
      ? { ...current, head: { ...current.head, headHairVisibility: visibility } }
      : current)
  }

  function setWeaponPlacement(slot: WeaponSlot, placement: WeaponPlacement) {
    setEquipped((current) => current[slot]
      ? { ...current, [slot]: { ...current[slot], weaponPlacement: placement } }
      : current)
  }

  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="#/" aria-label="Glamour Viewer home">
          <span className="brand-mark" aria-hidden="true">GV</span>
          <span>Glamour Viewer</span>
        </a>
        <div className="privacy-pill"><span /> Browser-only processing</div>
      </header>

      <main>
        <section className={`hero${source ? ' hero-connected' : ''}`}>
          <div className="hero-copy">
            <p className="eyebrow">Your wardrobe. Your files.</p>
            <h1>Preview a look without uploading your game.</h1>
            <p className="hero-lead">
              Choose a local FFXIV install or connect your own converted asset bucket. Parsing, conversion, and rendering happen in your browser.
            </p>
            <div className="trust-row">
              <span>No uploads</span><span>No account</span><span>No asset proxy</span>
            </div>
          </div>
          {!source && (
            <div className="hero-visual">
              <Suspense fallback={<div className="viewer-loading">Loading default character…</div>}>
                <DefaultCharacterPreview />
              </Suspense>
            </div>
          )}
        </section>

        {sharedSet && (
          <section className="shared-set" aria-labelledby="shared-title">
            <div>
              <p className="eyebrow">Shared set</p>
              <h2 id="shared-title">{sharedSet.name}</h2>
              <p>{CHARACTER_PRESETS.find(({ code }) => code === sharedSet.raceCode)?.label}</p>
            </div>
            <ul>{sharedSet.items.map((item) => (
              <li key={item.slot}>
                {item.name}{item.dyes?.some(Boolean) ? ` · ${item.dyes.map((dye) => dye?.name).filter(Boolean).join(' / ')}` : ''}
              </li>
            ))}</ul>
            <div className="shared-set-actions">
              <p className="shared-note">{source ? 'Apply the recipe to the connected preview.' : 'Connect your own assets below to render this set.'}</p>
              <button className="button secondary" type="button" onClick={() => applySharedSet(sharedSet)}>Apply recipe</button>
            </div>
          </section>
        )}

        <section className="source-section" aria-labelledby="source-title">
          <div className="section-heading">
            <p className="eyebrow">Start here</p>
            <h2 id="source-title">Choose where your assets live</h2>
            <p>These are the only two connection modes. This deployed app never receives or stores game data.</p>
          </div>
          <div className="source-grid">
            <LocalInstallPanel onConnect={setSource} />
            <HostedAssetsPanel onConnect={setSource} />
          </div>
        </section>

        {source && (
          <section className="connection-bar" aria-live="polite">
            <div>
              <span className="connection-dot" />
              <strong>{source.label}</strong>
              <span>{source.kind === 'local' ? 'Local read-only source' : 'Direct bucket connection'}</span>
            </div>
            <div className="connection-meta">
              {source.fileCount !== undefined && <span>{source.fileCount.toLocaleString()} files</span>}
              {source.totalBytes !== undefined && <span>{formatBytes(source.totalBytes)}</span>}
              <button
                className="text-button"
                onClick={() => {
                  setSource(undefined)
                  setEquipped({})
                }}
              >Disconnect</button>
            </div>
          </section>
        )}

        {source && (
          <section className="viewer-workspace" aria-label="Character preview, dressing room, and customization">
            <div className="workspace-preview">
              <div className="hero-visual">
                <Suspense fallback={<div className="viewer-loading">Loading renderer…</div>}>
                  <ViewerCanvas source={source} equipped={equipped} raceCode={raceCode} customization={customization} />
                </Suspense>
              </div>
            </div>
            <div className="workspace-catalog">
              <nav className="workspace-tabs" aria-label="Dressing room sections">
                <button className={workspaceTab === 'dressing' ? 'active' : ''} type="button" onClick={() => setWorkspaceTab('dressing')}>Dressing Room</button>
                <button className={workspaceTab === 'customization' ? 'active' : ''} type="button" onClick={() => setWorkspaceTab('customization')}>Customization</button>
              </nav>
              <Suspense fallback={<div className="catalog-loading">Loading workspace…</div>}>
                {workspaceTab === 'dressing' ? (
                  <ArmorCatalog
                    source={source}
                    equipped={equipped}
                    onEquip={equip}
                    onRemove={unequip}
                    onDye={dyeEquipment}
                    onHeadHairVisibility={setHeadHairVisibility}
                    onWeaponPlacement={setWeaponPlacement}
                  />
                ) : (
                  <CustomizationPanel
                    raceCode={raceCode}
                    customization={customization}
                    onChange={setCustomization}
                    onRaceChange={setRaceCode}
                  />
                )}
              </Suspense>
            </div>
          </section>
        )}

        <section className="share-section">
          <div>
            <p className="eyebrow">Static share links</p>
            <h2>Share the recipe, never the assets.</h2>
            <p>Set metadata lives in the URL hash. The recipient supplies their own local install or bucket.</p>
          </div>
          <div className="share-actions">
            <button className="button secondary" type="button" onClick={shareCurrentLook}>
              {copied ? 'Link copied' : 'Copy current look link'}
            </button>
            <form className="share-import" onSubmit={importSharedLink}>
              <label className="field-label" htmlFor="share-link">Import a recipe URL</label>
              <div className="url-row">
                <input
                  id="share-link"
                  type="text"
                  value={shareInput}
                  onChange={(event) => setShareInput(event.target.value)}
                  placeholder="Paste a /#/set/ link"
                  autoComplete="off"
                />
                <button className="button primary">Import</button>
              </div>
            </form>
            {shareNotice && <p className="share-feedback" role="status">{shareNotice}</p>}
            {shareError && <p className="error-message share-feedback" role="alert">{shareError}</p>}
          </div>
        </section>
      </main>

      <footer>
        <p>Unofficial fan tool. Not affiliated with or endorsed by Square Enix.</p>
        <p>Game imagery © SQUARE ENIX. FINAL FANTASY is a registered trademark of Square Enix Holdings Co., Ltd.</p>
        <p>Vercel hosts no Square Enix data.</p>
      </footer>
    </div>
  )
}

