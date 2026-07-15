import { useState } from 'react'
import type { AssetSource, CacheManifest } from '../asset-source/types'
import { formatBytes } from '../lib/format'
import { manifestUrl, validateAssetBaseUrl } from '../lib/url'

interface Props {
  onConnect: (source: AssetSource) => void
}

export function HostedAssetsPanel({ onConnect }: Props) {
  const [value, setValue] = useState('')
  const [candidate, setCandidate] = useState<string>()
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [warning, setWarning] = useState<string>()

  function reviewUrl() {
    const result = validateAssetBaseUrl(value)
    if (!result.ok) {
      setCandidate(undefined)
      setError(result.error)
      return
    }
    setError(undefined)
    setWarning(undefined)
    setCandidate(result.normalized)
  }

  async function confirmAndConnect() {
    if (!candidate) return
    setBusy(true)
    setError(undefined)
    setWarning(undefined)
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 15_000)

    try {
      // This is deliberately the first network request in this flow. The validated
      // destination has already been displayed and explicitly confirmed by the user.
      const response = await fetch(manifestUrl(candidate), { signal: controller.signal, mode: 'cors' })
      if (!response.ok) throw new Error(`Manifest request returned HTTP ${response.status}.`)
      const manifest = (await response.json()) as CacheManifest
      if (!Number.isInteger(manifest.version) || manifest.version < 1) throw new Error('The cache manifest has an unsupported format.')

      const files = Array.isArray(manifest.files) ? manifest.files : []
      const totalBytes = files.reduce((sum, file) => sum + (Number.isFinite(file.bytes) ? file.bytes! : 0), 0)
      if (!response.headers.has('content-length')) {
        setWarning('Connected, but Content-Length is not exposed. Progress estimates may be unavailable.')
      }
      onConnect({
        kind: 'remote',
        label: new URL(candidate).host,
        baseUrl: candidate,
        fileCount: files.length || undefined,
        totalBytes: totalBytes || undefined,
      })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The asset cache could not be reached.')
    } finally {
      window.clearTimeout(timeout)
      setBusy(false)
    }
  }

  return (
    <section className="source-card" aria-labelledby="hosted-title">
      <div className="source-icon" aria-hidden="true">02</div>
      <div>
        <p className="eyebrow">Bring your own storage</p>
        <h2 id="hosted-title">Self-hosted assets</h2>
        <p>Connect a converted cache on your R2, S3, or other web-accessible bucket.</p>
      </div>
      <label className="field-label" htmlFor="asset-url">Bucket base URL</label>
      <div className="url-row">
        <input
          id="asset-url"
          type="url"
          inputMode="url"
          placeholder="https://assets.example.com/glamour-cache/"
          value={value}
          onChange={(event) => {
            setValue(event.target.value)
            setCandidate(undefined)
            setError(undefined)
          }}
          onKeyDown={(event) => event.key === 'Enter' && reviewUrl()}
        />
        <button className="button secondary" onClick={reviewUrl}>Review</button>
      </div>

      {candidate && (
        <div className="confirm-box" role="region" aria-label="Confirm asset server">
          <span>No request has been sent yet</span>
          <strong>{candidate}</strong>
          <p>The app will fetch <code>manifest.json</code> and subsequent assets directly from this origin.</p>
          <button className="button primary" onClick={confirmAndConnect} disabled={busy}>
            {busy ? 'Connecting…' : 'Confirm and connect'}
          </button>
        </div>
      )}
      {error && <p className="error-message" role="alert">{error}</p>}
      {warning && <p className="inline-message" role="status">{warning}</p>}
      <details className="cors-details">
        <summary>Required bucket CORS headers</summary>
        <pre><code>{`Access-Control-Allow-Origin: https://your-app.vercel.app\nAccess-Control-Expose-Headers: Content-Length`}</code></pre>
        <p>Use <code>*</code> for Allow-Origin only if the cache is intentionally public.</p>
      </details>
    </section>
  )
}
