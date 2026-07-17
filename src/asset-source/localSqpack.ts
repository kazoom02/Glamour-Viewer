const CHARACTER_INDEX_NAME = '040000.win32.index2'
const CHARACTER_DATA_NAME = '040000.win32.dat0'
const REPOSITORY_NAME = 'ffxiv'

// Folder names on the usual path to game/sqpack. Searched first so a broad pick
// (a Steam library, the install root) still resolves within the visit budget
// instead of walking every unrelated directory in the tree.
const PROMISING_FOLDER_HINTS = [
  'sqpack',
  'game',
  'final fantasy',
  'ffxiv',
  'square',
  'common',
  'steamapps',
  'steam',
]

export interface SqpackInspection {
  valid: boolean
  repository: string
  indexName?: string
  missing: string[]
}

async function fileExists(directory: FileSystemDirectoryHandle, name: string): Promise<boolean> {
  try {
    await directory.getFileHandle(name)
    return true
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') return false
    throw error
  }
}

function folderRank(name: string): number {
  const lower = name.toLowerCase()
  return PROMISING_FOLDER_HINTS.some((hint) => lower.includes(hint)) ? 1 : 0
}

async function containsCharacterRepository(directory: FileSystemDirectoryHandle): Promise<boolean> {
  try {
    const repository = await directory.getDirectoryHandle(REPOSITORY_NAME)
    return await fileExists(repository, CHARACTER_INDEX_NAME)
  } catch {
    return false
  }
}

/**
 * Locates the game/sqpack directory at or beneath a picked folder. A browser
 * can't open a path on the user's behalf, but once they pick anything nearby —
 * the sqpack folder itself, the `game` folder, the install root, or even a Steam
 * library — this finds the exact folder so they can't really pick "wrong".
 * Returns the picked handle itself when it already is the sqpack folder.
 * Bounded BFS (promising folder names first, capped depth and visits) keeps a
 * large or unrelated tree cheap; returns undefined when nothing is found.
 */
export async function locateSqpackRoot(
  root: FileSystemDirectoryHandle,
  options: { maxDepth?: number; maxVisits?: number } = {},
): Promise<FileSystemDirectoryHandle | undefined> {
  const maxDepth = options.maxDepth ?? 5
  const maxVisits = options.maxVisits ?? 400
  const queue: Array<{ handle: FileSystemDirectoryHandle; depth: number }> = [{ handle: root, depth: 0 }]
  let visits = 0
  while (queue.length) {
    const current = queue.shift()!
    if (++visits > maxVisits) break
    if (await containsCharacterRepository(current.handle)) return current.handle
    if (current.depth >= maxDepth) continue
    const children: FileSystemDirectoryHandle[] = []
    try {
      for await (const entry of current.handle.values()) {
        if (entry.kind === 'directory') children.push(entry as FileSystemDirectoryHandle)
      }
    } catch {
      // A directory that cannot be enumerated (permission, transient IO) is
      // simply skipped; other branches may still contain the install.
      continue
    }
    children.sort((left, right) => folderRank(right.name) - folderRank(left.name))
    for (const child of children) queue.push({ handle: child, depth: current.depth + 1 })
  }
  return undefined
}

export async function inspectSqpackDirectory(root: FileSystemDirectoryHandle): Promise<SqpackInspection> {
  let repository: FileSystemDirectoryHandle
  try {
    repository = await root.getDirectoryHandle('ffxiv')
  } catch {
    return { valid: false, repository: 'ffxiv', missing: ['ffxiv/'] }
  }

  const indexName = await fileExists(repository, CHARACTER_INDEX_NAME) ? CHARACTER_INDEX_NAME : undefined

  const missing: string[] = []
  if (!indexName) missing.push(`ffxiv/${CHARACTER_INDEX_NAME}`)
  if (!(await fileExists(repository, CHARACTER_DATA_NAME))) missing.push(`ffxiv/${CHARACTER_DATA_NAME}`)
  return { valid: missing.length === 0, repository: 'ffxiv', indexName, missing }
}

export function inspectFallbackSqpack(files: File[]): SqpackInspection {
  const paths = new Set(files.map((file) => file.webkitRelativePath.replaceAll('\\', '/').toLowerCase()))
  const hasSuffix = (suffix: string) => [...paths].some((path) => path === `ffxiv/${suffix}` || path.endsWith(`/ffxiv/${suffix}`))
  const indexName = hasSuffix(CHARACTER_INDEX_NAME) ? CHARACTER_INDEX_NAME : undefined
  const missing: string[] = []
  if (!indexName) missing.push(`ffxiv/${CHARACTER_INDEX_NAME}`)
  if (!hasSuffix(CHARACTER_DATA_NAME)) missing.push(`ffxiv/${CHARACTER_DATA_NAME}`)
  return { valid: missing.length === 0, repository: 'ffxiv', indexName, missing }
}

export async function openSqpackFile(
  root: FileSystemDirectoryHandle,
  repository: string,
  fileName: string,
): Promise<File> {
  const repositoryHandle = await root.getDirectoryHandle(repository)
  return repositoryHandle.getFileHandle(fileName).then((handle) => handle.getFile())
}

export async function readFileRange(file: File, offset: number, length: number): Promise<ArrayBuffer> {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0) {
    throw new RangeError('File ranges must use non-negative safe integers.')
  }
  if (offset + length > file.size) throw new RangeError('Requested range extends beyond the file.')
  return file.slice(offset, offset + length).arrayBuffer()
}
