const CHARACTER_INDEX_NAMES = ['040000.win32.index2', '040000.win32.index'] as const
const CHARACTER_DATA_NAME = '040000.win32.dat0'

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

export async function inspectSqpackDirectory(root: FileSystemDirectoryHandle): Promise<SqpackInspection> {
  let repository: FileSystemDirectoryHandle
  try {
    repository = await root.getDirectoryHandle('ffxiv')
  } catch {
    return { valid: false, repository: 'ffxiv', missing: ['ffxiv/'] }
  }

  let indexName: string | undefined
  for (const candidate of CHARACTER_INDEX_NAMES) {
    if (await fileExists(repository, candidate)) {
      indexName = candidate
      break
    }
  }

  const missing: string[] = []
  if (!indexName) missing.push(`ffxiv/${CHARACTER_INDEX_NAMES.join(' or ')}`)
  if (!(await fileExists(repository, CHARACTER_DATA_NAME))) missing.push(`ffxiv/${CHARACTER_DATA_NAME}`)
  return { valid: missing.length === 0, repository: 'ffxiv', indexName, missing }
}

export function inspectFallbackSqpack(files: File[]): SqpackInspection {
  const paths = new Set(files.map((file) => file.webkitRelativePath.replaceAll('\\', '/').toLowerCase()))
  const hasSuffix = (suffix: string) => [...paths].some((path) => path.endsWith(`/ffxiv/${suffix}`))
  const indexName = CHARACTER_INDEX_NAMES.find(hasSuffix)
  const missing: string[] = []
  if (!indexName) missing.push(`ffxiv/${CHARACTER_INDEX_NAMES.join(' or ')}`)
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
