import { useEffect, useRef, useState } from 'react'
import { forgetDirectoryHandle, loadDirectoryHandle, saveDirectoryHandle } from '../lib/handleStore'
import { formatBytes } from '../lib/format'
import type { AssetSource } from '../asset-source/types'
import { inspectFallbackSqpack, inspectSqpackDirectory } from '../asset-source/localSqpack'

interface Props {
  onConnect: (source: AssetSource) => void
}

type SavedHandleState =
  | { status: 'checking' }
  | { status: 'none' }
  | { status: 'ready'; handle: FileSystemDirectoryHandle }
  | { status: 'permission'; handle: FileSystemDirectoryHandle }

export function LocalInstallPanel({ onConnect }: Props) {
  const supportsPicker = typeof window.showDirectoryPicker === 'function'
  const [saved, setSaved] = useState<SavedHandleState>({ status: 'checking' })
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string>()
  const inputRef = useRef<HTMLInputElement>(null)

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
    try {
      const handle = await window.showDirectoryPicker({ id: 'ffxiv-sqpack', mode: 'read' })
      const inspection = await inspectSqpackDirectory(handle)
      if (!inspection.valid) {
        setMessage(`That does not look like game/sqpack. Missing: ${inspection.missing.join(', ')}`)
        return
      }
      await saveDirectoryHandle(handle)
      setSaved({ status: 'ready', handle })
      onConnect({ kind: 'local', label: handle.name, access: 'handle', handle })
      setMessage(`Validated ${inspection.indexName} and the character data archive.`)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setMessage('The folder could not be opened. Check browser permissions and try again.')
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
        <p>Choose your <code>game/sqpack</code> folder. Files stay on this device and are read only when needed.</p>
      </div>

      {supportsPicker ? (
        <div className="card-actions">
          {saved.status === 'ready' && (
            <button className="button secondary" onClick={() => reconnect(saved.handle)}>
              Continue with {saved.handle.name}
            </button>
          )}
          {saved.status === 'permission' && (
            <button className="button secondary" onClick={() => reconnect(saved.handle)}>Restore folder access</button>
          )}
          <button className="button primary" onClick={chooseDirectory}>Choose sqpack folder</button>
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
        </div>
      ) : (
        <div className="fallback-box">
          <strong>Compatibility folder picker</strong>
          <p>Firefox and Safari load the whole directory into memory. Large installs will be slow and may exhaust the tab’s memory.</p>
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
      {message && <p className="inline-message" role="status">{message}</p>}
    </section>
  )
}
