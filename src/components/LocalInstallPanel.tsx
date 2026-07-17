import { useEffect, useRef, useState } from 'react'
import { forgetDirectoryHandle, loadDirectoryHandle, saveDirectoryHandle } from '../lib/handleStore'
import { formatBytes } from '../lib/format'
import type { AssetSource } from '../asset-source/types'
import { inspectFallbackSqpack, inspectSqpackDirectory, locateSqpackRoot } from '../asset-source/localSqpack'

interface Props {
  onConnect: (source: AssetSource) => void
}

// Whether the automatic folder finder (File System Access API) is usable here,
// and if not, an accurate reason. The API only exists in a secure context
// (https or http://localhost), so a dev server opened via a LAN IP — or a
// browser with the API disabled — lands on the manual path instead.
function automaticPickerStatus(): { available: boolean; reason?: string } {
  if (typeof window === 'undefined') return { available: false }
  if (typeof window.showDirectoryPicker === 'function') return { available: true }
  if (window.isSecureContext === false) {
    return {
      available: false,
      reason: 'Automatic finding needs a secure page. Open the app at http://localhost or over https:// (not a http:// LAN address).',
    }
  }
  return {
    available: false,
    reason: 'This browser has folder access turned off. Use manual upload, or enable the File System Access API in your browser settings.',
  }
}

// A browser can't open the install path automatically, but showing the usual
// location lets the user paste it into the picker's address bar. The pick is
// forgiving now, so any folder along these paths works.
function defaultInstallHint(): { os: string; paths: string[] } {
  const platform = typeof navigator === 'undefined' ? '' : navigator.userAgent
  if (/Mac/i.test(platform)) {
    return {
      os: 'macOS',
      paths: ['~/Library/Application Support/Steam/steamapps/common/FINAL FANTASY XIV Online/game/sqpack'],
    }
  }
  return {
    os: 'Windows',
    paths: [
      'C:\\Program Files (x86)\\Steam\\steamapps\\common\\FINAL FANTASY XIV Online\\game\\sqpack',
      'C:\\Program Files (x86)\\SquareEnix\\FINAL FANTASY XIV - A Realm Reborn\\game\\sqpack',
    ],
  }
}

type SavedHandleState =
  | { status: 'checking' }
  | { status: 'none' }
  | { status: 'ready'; handle: FileSystemDirectoryHandle }
  | { status: 'permission'; handle: FileSystemDirectoryHandle }

export function LocalInstallPanel({ onConnect }: Props) {
  const picker = automaticPickerStatus()
  const supportsPicker = picker.available
  const [saved, setSaved] = useState<SavedHandleState>({ status: 'checking' })
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string>()
  const [method, setMethod] = useState<'auto' | 'manual'>(supportsPicker ? 'auto' : 'manual')
  const inputRef = useRef<HTMLInputElement>(null)
  const installHint = defaultInstallHint()

  useEffect(() => {
    let active = true
    loadDirectoryHandle()
      .then(async (handle) => {
        if (!active || !handle) {
          if (active) setSaved({ status: 'none' })
          return
        }

        const permission = await handle.queryPermission({ mode: 'read' })
        if (permission === 'granted') {
          setSaved({ status: 'ready', handle })
          return
        }

        // Browsers may reject this without a fresh user gesture. We still re-request
        // on load, then expose an explicit reconnect button when a gesture is needed.
        const requested = await handle.requestPermission({ mode: 'read' }).catch(() => 'prompt' as PermissionState)
        if (!active) return
        setSaved(requested === 'granted' ? { status: 'ready', handle } : { status: 'permission', handle })
      })
      .catch(() => active && setSaved({ status: 'none' }))
    return () => {
      active = false
    }
  }, [])

  async function chooseDirectory() {
    if (!window.showDirectoryPicker) return
    setMessage(undefined)
    setBusy(true)
    try {
      const picked = await window.showDirectoryPicker({ id: 'ffxiv-sqpack', mode: 'read' })
      // Accept the sqpack folder, the game folder, the install root, or a Steam
      // library — then descend to the exact sqpack folder within the pick.
      const located = await locateSqpackRoot(picked)
      const target = located ?? picked
      const inspection = await inspectSqpackDirectory(target)
      if (!inspection.valid) {
        setMessage(`That does not look like a FINAL FANTASY XIV install. Couldn’t find game/sqpack (missing ${inspection.missing.join(', ')}).`)
        return
      }
      await saveDirectoryHandle(target)
      setSaved({ status: 'ready', handle: target })
      onConnect({ kind: 'local', label: target.name, access: 'handle', handle: target })
      const note = located && located !== picked ? ` Found it inside “${picked.name}”.` : ''
      setMessage(`Validated ${inspection.indexName} and the character data archive.${note}`)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setMessage('The folder could not be opened. Check browser permissions and try again.')
    } finally {
      setBusy(false)
    }
  }

  async function reconnect(handle: FileSystemDirectoryHandle) {
    const permission = await handle.requestPermission({ mode: 'read' }).catch(() => 'denied' as PermissionState)
    if (permission === 'granted') {
      const inspection = await inspectSqpackDirectory(handle)
      if (!inspection.valid) {
        setMessage(`The saved folder is missing: ${inspection.missing.join(', ')}`)
        return
      }
      setSaved({ status: 'ready', handle })
      onConnect({ kind: 'local', label: handle.name, access: 'handle', handle })
    } else {
      setMessage('Read access was not granted. Your saved handle stays on this device.')
    }
  }

  async function useFallback(files: FileList | null) {
    if (!files?.length) return
    setBusy(true)
    setMessage(undefined)
    try {
      const selectedFiles = Array.from(files)
      const inspection = inspectFallbackSqpack(selectedFiles)
      if (!inspection.valid) {
        setMessage(`That does not look like game/sqpack. Missing: ${inspection.missing.join(', ')}`)
        return
      }
      const { summarizeFiles } = await import('../asset-source/parser')
      const summary = await summarizeFiles(selectedFiles)
      onConnect({
        kind: 'local',
        label: files[0]?.webkitRelativePath.split('/')[0] || 'Selected folder',
        access: 'fallback',
        fileCount: summary.fileCount,
        totalBytes: summary.totalBytes,
        files: selectedFiles,
      })
      setMessage(`Indexed ${summary.fileCount.toLocaleString()} files (${formatBytes(summary.totalBytes)}) in this tab.`)
    } catch {
      setMessage('The selected directory could not be indexed.')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <section className="source-card" aria-labelledby="local-title">
      <div className="source-icon" aria-hidden="true">01</div>
      <div>
        <p className="eyebrow">Private & direct</p>
        <h2 id="local-title">Local install</h2>
        <p>Point at your FINAL FANTASY XIV install — the <code>game/sqpack</code> folder, the game folder, or the install root all work. Files stay on this device and are read only when needed.</p>
      </div>

      <div className="local-connect">
      <div className="method-toggle" role="group" aria-label="How to connect your install">
        <button
          type="button"
          aria-pressed={method === 'auto'}
          className={method === 'auto' ? 'active' : ''}
          onClick={() => setMethod('auto')}
          disabled={!supportsPicker}
          title={picker.reason}
        >
          Find automatically
        </button>
        <button
          type="button"
          aria-pressed={method === 'manual'}
          className={method === 'manual' ? 'active' : ''}
          onClick={() => setMethod('manual')}
        >
          Upload manually
        </button>
      </div>

      {!supportsPicker && picker.reason && (
        <p className="method-note method-unavailable" role="status">{picker.reason}</p>
      )}

      {method === 'auto' ? (
        <div className="card-actions">
          <p className="method-note">We open a folder picker, then find your <code>game/sqpack</code> data inside whatever you choose. Files are read on demand and never uploaded. Chrome &amp; Edge.</p>
          {saved.status === 'ready' && (
            <button className="button secondary" onClick={() => reconnect(saved.handle)}>
              Continue with {saved.handle.name}
            </button>
          )}
          {saved.status === 'permission' && (
            <button className="button secondary" onClick={() => reconnect(saved.handle)}>Restore folder access</button>
          )}
          <button className="button primary" onClick={chooseDirectory} disabled={busy}>
            {busy ? 'Locating install…' : 'Choose FFXIV folder'}
          </button>
          {(saved.status === 'ready' || saved.status === 'permission') && (
            <button
              className="text-button"
              onClick={async () => {
                await forgetDirectoryHandle()
                setSaved({ status: 'none' })
              }}
            >
              Forget saved folder
            </button>
          )}
          <details className="install-hint">
            <summary>Where is my install folder?</summary>
            <p>Pick the folder in the picker — we’ll find <code>game/sqpack</code> inside it. Typical {installHint.os} locations:</p>
            <ul>
              {installHint.paths.map((path) => <li key={path}><code>{path}</code></li>)}
            </ul>
          </details>
        </div>
      ) : (
        <div className="fallback-box">
          <strong>Upload the folder</strong>
          <p>Select your <code>game/sqpack</code> folder to load it into this tab. Works in any browser, but the whole folder is read into memory — pick the <code>sqpack</code> (or <code>game</code>) folder, not a larger parent, or a big install may exhaust the tab.</p>
          <input
            ref={inputRef}
            className="directory-input"
            type="file"
            multiple
            // React passes this Chromium/WebKit directory-selection attribute through.
            {...({ webkitdirectory: '' } as React.InputHTMLAttributes<HTMLInputElement>)}
            onChange={(event) => useFallback(event.currentTarget.files)}
            disabled={busy}
          />
        </div>
      )}
      </div>
      {message && <p className="inline-message" role="status">{message}</p>}
    </section>
  )
}
