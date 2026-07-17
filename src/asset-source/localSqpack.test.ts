import { describe, expect, it } from 'vitest'
import { locateSqpackRoot } from './localSqpack'

type Tree = { [name: string]: Tree | 'file' }

// A minimal FileSystemDirectoryHandle stand-in backed by a plain object tree.
function makeDir(name: string, tree: Tree): FileSystemDirectoryHandle {
  const notFound = () => new DOMException(`${name} has no such entry`, 'NotFoundError')
  const handle = {
    kind: 'directory' as const,
    name,
    async getDirectoryHandle(childName: string) {
      const child = tree[childName]
      if (child && child !== 'file') return makeDir(childName, child)
      throw notFound()
    },
    async getFileHandle(fileName: string) {
      if (tree[fileName] === 'file') return { kind: 'file' as const, name: fileName }
      throw notFound()
    },
    async *values() {
      for (const [childName, child] of Object.entries(tree)) {
        yield child === 'file'
          ? { kind: 'file' as const, name: childName }
          : makeDir(childName, child)
      }
    },
  }
  return handle as unknown as FileSystemDirectoryHandle
}

const sqpackContents: Tree = {
  ffxiv: { '040000.win32.index2': 'file', '040000.win32.dat0': 'file' },
  ex1: { '040000.win32.index2': 'file' },
}

describe('locateSqpackRoot', () => {
  it('returns the picked handle when it already is the sqpack folder', async () => {
    const root = makeDir('sqpack', sqpackContents)
    expect(await locateSqpackRoot(root)).toBe(root)
  })

  it('descends from the game folder', async () => {
    const root = makeDir('game', { sqpack: sqpackContents })
    const located = await locateSqpackRoot(root)
    expect(located?.name).toBe('sqpack')
  })

  it('descends from the install root', async () => {
    const root = makeDir('FINAL FANTASY XIV Online', {
      boot: { 'ffxivboot.exe': 'file' },
      game: { sqpack: sqpackContents, 'ffxiv_dx11.exe': 'file' },
    })
    const located = await locateSqpackRoot(root)
    expect(located?.name).toBe('sqpack')
  })

  it('finds the install inside a Steam library alongside unrelated games', async () => {
    const root = makeDir('common', {
      'Some Other Game': { data: { assets: {} } },
      'FINAL FANTASY XIV Online': { game: { sqpack: sqpackContents } },
      'Another Game': { bin: {} },
    })
    const located = await locateSqpackRoot(root)
    expect(located?.name).toBe('sqpack')
  })

  it('returns undefined when no sqpack folder is present', async () => {
    const root = makeDir('Downloads', { notes: { 'todo.txt': 'file' } })
    expect(await locateSqpackRoot(root)).toBeUndefined()
  })

  it('does not require the ffxiv repository index to be at the picked level', async () => {
    // A folder that merely contains an `ffxiv` directory without the index file
    // is not a valid match; the real sqpack folder deeper in wins instead.
    const root = makeDir('root', {
      ffxiv: { 'readme.txt': 'file' },
      game: { sqpack: sqpackContents },
    })
    const located = await locateSqpackRoot(root)
    expect(located?.name).toBe('sqpack')
  })

  it('respects the depth budget', async () => {
    const deep = makeDir('root', { a: { b: { c: { d: { e: { sqpack: sqpackContents } } } } } })
    expect(await locateSqpackRoot(deep, { maxDepth: 3 })).toBeUndefined()
    expect((await locateSqpackRoot(deep, { maxDepth: 6 }))?.name).toBe('sqpack')
  })
})
