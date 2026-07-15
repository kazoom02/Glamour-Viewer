/// <reference lib="webworker" />

import { readImcEntry } from './imc'
import {
  bakeCharacterMaterial,
  bakeHairMaterial,
  bakeIrisMaterial,
  bakeSkinNormal,
  materialAlphaMode,
  usesCharacterColorTable,
} from './materialBake'
import { materialCandidates } from './materialPath'
import { parseMtrl, type TextureRole } from './mtrl'
import { createLocalAssetReader, type LocalAssetReader } from './sqpack'
import { decodeTex, type DecodedTexture } from './tex'
import type { MaterialLoadRequest, MaterialLoadResult } from './materialTypes'
import type { AssetSource } from './types'

interface Request {
  id: number
  source: Extract<AssetSource, { kind: 'local' }>
  requests: MaterialLoadRequest[]
}

const CACHE_VERSION = 1
const memoryCache = new Map<string, DecodedTexture>()

function cacheDatabase(): Promise<IDBDatabase | undefined> {
  if (!('indexedDB' in self)) return Promise.resolve(undefined)
  return new Promise((resolve) => {
    const request = indexedDB.open('glamour-viewer-textures', CACHE_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains('decoded')) database.createObjectStore('decoded')
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => resolve(undefined)
  })
}

const database = cacheDatabase()

async function cacheGet(key: string): Promise<DecodedTexture | undefined> {
  const memory = memoryCache.get(key)
  if (memory) return memory
  const db = await database
  if (!db) return undefined
  return new Promise((resolve) => {
    const transaction = db.transaction('decoded', 'readonly')
    const request = transaction.objectStore('decoded').get(key)
    request.onsuccess = () => {
      const value = request.result as DecodedTexture | undefined
      if (value?.rgba instanceof Uint8Array) memoryCache.set(key, value)
      resolve(value?.rgba instanceof Uint8Array ? value : undefined)
    }
    request.onerror = () => resolve(undefined)
  })
}

async function cachePut(key: string, texture: DecodedTexture): Promise<void> {
  memoryCache.set(key, texture)
  const db = await database
  if (!db) return
  await new Promise<void>((resolve) => {
    const transaction = db.transaction('decoded', 'readwrite')
    transaction.objectStore('decoded').put(texture, key)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => resolve()
    transaction.onabort = () => resolve()
  })
}

function normalizedMaterialKey(path: string): string {
  return path.replaceAll('\\', '/').toLowerCase()
}

async function readFirst(reader: LocalAssetReader, paths: string[]): Promise<{ path: string; bytes: ArrayBuffer }> {
  const errors: string[] = []
  for (const path of paths) {
    try {
      return { path, bytes: await reader.read(path) }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error))
    }
  }
  if (!paths.length) throw new Error('No material path candidates were available.')
  throw new Error(`No material candidate was found. Tried: ${paths.join(', ')}. Last error: ${errors.at(-1) ?? 'unknown read error'}`)
}

async function loadTexture(
  reader: LocalAssetReader,
  sourceKey: string,
  path: string,
): Promise<DecodedTexture> {
  const key = `${CACHE_VERSION}:${sourceKey}:${path.toLowerCase()}`
  const cached = await cacheGet(key)
  if (cached) return cached
  const texture = decodeTex(await reader.read(path))
  await cachePut(key, texture)
  return texture
}

async function loadRequest(
  reader: LocalAssetReader,
  sourceKey: string,
  request: MaterialLoadRequest,
): Promise<MaterialLoadResult> {
  const materials: MaterialLoadResult['materials'] = {}
  const errors: string[] = []
  let materialId = request.variant ?? 1
  let attributeMask: number | undefined
  if (request.imcPath && request.slot && request.variant !== undefined) {
    try {
      const entry = readImcEntry(await reader.read(request.imcPath), request.slot, request.variant)
      materialId = entry.materialId
      attributeMask = entry.attributeMask
    } catch (error) {
      errors.push(`[imc] ${request.imcPath}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  for (const materialReference of request.materialPaths) {
    try {
      const materialFile = await readFirst(reader, materialCandidates(request, materialReference, materialId))
      const parsed = parseMtrl(materialFile.bytes)
      const decoded = {
        path: materialFile.path,
        shaderPackage: parsed.shaderPackage,
        alphaMode: materialAlphaMode(parsed.shaderPackage, materialReference),
        textures: {},
      } as MaterialLoadResult['materials'][string]
      for (const textureReference of parsed.textures) {
        if (!textureReference.path) continue
        const role = textureReference.role
        if (!(['diffuse', 'normal', 'mask', 'specular', 'index'] as TextureRole[]).includes(role)) continue
        if (decoded.textures[role as keyof typeof decoded.textures]) continue
        try {
          decoded.textures[role as keyof typeof decoded.textures] = await loadTexture(reader, sourceKey, textureReference.path)
        } catch (error) {
          errors.push(`[tex:${role}] ${textureReference.path}: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
      const shader = parsed.shaderPackage.toLowerCase()
      if (parsed.colorTable) {
        if (usesCharacterColorTable(shader)) {
          const baked = bakeCharacterMaterial(parsed.colorTable, decoded.textures)
          if (baked) Object.assign(decoded.textures, baked)
        }
        decoded.colorTableRows = parsed.colorTable.rows.length
        decoded.dyeableRows = parsed.dyeTable?.filter((row) => row.flags !== 0).length ?? 0
      }
      if (shader === 'hair.shpk') {
        const baked = bakeHairMaterial(decoded.textures.normal, decoded.textures.mask)
        if (baked) Object.assign(decoded.textures, baked)
      } else if (shader === 'iris.shpk') {
        const diffuse = bakeIrisMaterial(decoded.textures.diffuse, decoded.textures.mask)
        if (diffuse) decoded.textures.diffuse = diffuse
      } else if (shader === 'skin.shpk') {
        const normal = bakeSkinNormal(decoded.textures.normal)
        if (normal) decoded.textures.normal = normal
      }
      materials[normalizedMaterialKey(materialReference)] = decoded
    } catch (error) {
      errors.push(`[mtrl] ${materialReference}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  return { modelPath: request.modelPath, materials, errors, attributeMask }
}

async function sourceFingerprint(source: Extract<AssetSource, { kind: 'local' }>): Promise<string> {
  try {
    if (source.handle) {
      const fingerprints: string[] = []
      for (const name of ['ffxiv', 'ex1', 'ex2', 'ex3', 'ex4', 'ex5']) {
        try {
          const repository = await source.handle.getDirectoryHandle(name)
          const index = await (await repository.getFileHandle('040000.win32.index2')).getFile()
          fingerprints.push(`${name}:${index.size}:${index.lastModified}`)
        } catch {
          // Expansion repositories are optional.
        }
      }
      if (fingerprints.length) return `${source.label}:${fingerprints.join('|')}`
    }
    const indexes = source.files?.filter((file) => /\/(?:ffxiv|ex[1-5])\/040000\.win32\.index2$/i.test(`/${file.webkitRelativePath.replaceAll('\\', '/')}`))
    if (indexes?.length) {
      return `${source.label}:${indexes.map((file) => `${file.size}:${file.lastModified}`).join('|')}:${source.totalBytes ?? 0}`
    }
  } catch {
    // Fall through to the selection summary when a browser withholds metadata.
  }
  return `${source.label}:${source.fileCount ?? 0}:${source.totalBytes ?? 0}`
}

async function handleMessage(event: MessageEvent<Request>) {
  const { id, source, requests } = event.data
  try {
    const reader = createLocalAssetReader(source)
    const sourceKey = await sourceFingerprint(source)
    const results: MaterialLoadResult[] = []
    for (const request of requests) results.push(await loadRequest(reader, sourceKey, request))
    self.postMessage({ id, results })
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : 'The material worker failed.' })
  }
}

let queue = Promise.resolve()
self.onmessage = (event: MessageEvent<Request>) => {
  queue = queue.then(() => handleMessage(event))
}
