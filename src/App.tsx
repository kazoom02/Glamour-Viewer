import { lazy, Suspense, useEffect, useState } from 'react'
import type { AssetSource } from './asset-source/types'
import { HostedAssetsPanel } from './components/HostedAssetsPanel'
import { LocalInstallPanel } from './components/LocalInstallPanel'
import { formatBytes } from './lib/format'
import { encodeSharedSet, readSharedSet, type SharedSet } from './lib/share'
import type { ArmorItem, EquippedArmor } from './catalog/types'

const ViewerCanvas = lazy(() => import('./viewer/ViewerCanvas'))
const ArmorCatalog = lazy(() => import('./components/ArmorCatalog'))

export function App() {
  const [source, setSource] = useState<AssetSource>()
  const [sharedSet, setSharedSet] = useState<SharedSet | null>(() => readSharedSet())
  const [copied, setCopied] = useState(false)
  const [equipped, setEquipped] = useState<EquippedArmor>({})

  useEffect(() => {
    const onHashChange = () => setSharedSet(readSharedSet())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  async function shareExample() {
    const set: SharedSet = {
      name: 'Evening Expedition',
      race: 'Midlander',
      items: ['Weathered travel coat', 'Leather field gloves', 'Expedition boots'],
    }
    window.location.hash = `/set/${encodeSharedSet(set)}`
    await navigator.clipboard.writeText(window.location.href).catch(() => undefined)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  function equip(item: ArmorItem) {
    setEquipped((current) => ({ ...current, [item.slot]: item }))
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
        <section className="hero">
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
          <div className="hero-visual" aria-hidden={!source}>
            {source ? (
              <Suspense fallback={<div className="viewer-loading">Loading renderer…</div>}>
                <ViewerCanvas />
              </Suspense>
            ) : (
              <div className="silhouette">
                <div className="silhouette-head" />
                <div className="silhouette-body" />
                <p>Renderer loads after you connect a source</p>
              </div>
            )}
          </div>
        </section>

        {sharedSet && (
          <section className="shared-set" aria-labelledby="shared-title">
            <div>
              <p className="eyebrow">Shared set</p>
              <h2 id="shared-title">{sharedSet.name}</h2>
              {sharedSet.race && <p>{sharedSet.race}</p>}
            </div>
            <ul>{sharedSet.items.map((item) => <li key={item}>{item}</li>)}</ul>
            {!source && <p className="shared-note">Connect your own assets below to render this set.</p>}
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
          <Suspense fallback={<div className="catalog-loading">Loading armor catalog…</div>}>
            <ArmorCatalog
              source={source}
              equipped={equipped}
              onEquip={equip}
              onRemove={(slot) => setEquipped((current) => ({ ...current, [slot]: undefined }))}
            />
          </Suspense>
        )}

        <section className="share-section">
          <div>
            <p className="eyebrow">Static share links</p>
            <h2>Share the recipe, never the assets.</h2>
            <p>Set metadata lives in the URL hash. The recipient supplies their own local install or bucket.</p>
          </div>
          <button className="button secondary" onClick={shareExample}>{copied ? 'Link copied' : 'Try an example link'}</button>
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
