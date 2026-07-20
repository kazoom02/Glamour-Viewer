/// <reference lib="webworker" />

import { equipmentMaterialAnimationPath, equipmentVfxPath, readImcEntry } from './imc'
import { decodeAvfx } from './avfx'
import { decodeMaterialAnimation, MATERIAL_ANIMATION_SKELETON_PATH } from './materialAnimation'
import { EQUIPMENT_PARAMETER_PATH, handEquipmentVisibility, headEquipmentVisibility } from './eqp'
import {
  bakeCharacterMaterial,
  bakeHairMaterial,
  bakeIrisMaterial,
  bakeSkinNormal,
  bakeTattooMaterial,
  extractSkinColorMask,
  extractSkinLipMask,
  materialAlphaMode,
  usesCharacterColorTable,
} from './materialBake'
import { materialCandidates } from './materialPath'
import { materialTexturePriority, parseMtrl, type TextureRole } from './mtrl'
import { createLocalAssetReader, type LocalAssetReader } from './sqpack'
import {
  applyStainColors,
  applyStains,
  DAWNTRAIL_STAIN_TEMPLATE_PATH,
  LEGACY_STAIN_TEMPLATE_PATH,
  parseStainingTemplate,
  type StainingTemplate,
} from './stm'
import { decodeTex, type DecodedTexture } from './tex'
import type { MaterialLoadRequest, MaterialLoadResult } from './materialTypes'
import type { AssetSource } from './types'

interface Request {
  id: number
  source: Extract<AssetSource, { kind: 'local' }>
  requests: MaterialLoadRequest[]
}

// Bump whenever decoded/baked texture semantics change so IndexedDB cannot
// retain an older, glossier material interpretation across deployments.
const CACHE_VERSION = 5
const memoryCache = new Map<string, DecodedTexture>()
const stainingTemplateCache = new Map<string, Promise<StainingTemplate>>()
const equipmentParameterCache = new Map<string, Promise<ArrayBuffer>>()

function textureSummary(texture: DecodedTexture | undefined): string {
  if (!texture) return 'missing'
  const min = [255, 255, 255, 255]
  const max = [0, 0, 0, 0]
  const sum = [0, 0, 0, 0]
  const pixelCount = texture.width * texture.height
  const stride = Math.max(1, Math.floor(pixelCount / 4096))
  let samples = 0
  for (let pixel = 0; pixel < pixelCount; pixel += stride) {
    const offset = pixel * 4
    for (let channel = 0; channel < 4; channel += 1) {
      const value = texture.rgba[offset + channel]!
      min[channel] = Math.min(min[channel]!, value)
      max[channel] = Math.max(max[channel]!, value)
      sum[channel] = sum[channel]! + value
    }
    samples += 1
  }
  const mean = sum.map((value) => Math.round(value / Math.max(1, samples)))
  return `${texture.width}x${texture.height} format=0x${texture.format.toString(16)} rgba[min=${min.join(',')} max=${max.join(',')} mean=${mean.join(',')}]`
}

function samplerLabel(value: number | undefined): string {
  return value === undefined ? 'inferred' : `0x${value.toString(16).padStart(8, '0')}`
}

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

function loadStainingTemplate(
  reader: LocalAssetReader,
  sourceKey: string,
  kind: StainingTemplate['kind'],
): Promise<StainingTemplate> {
  const path = kind === 'dawntrail' ? DAWNTRAIL_STAIN_TEMPLATE_PATH : LEGACY_STAIN_TEMPLATE_PATH
  const key = `${sourceKey}:${kind}`
  let pending = stainingTemplateCache.get(key)
  if (!pending) {
    pending = reader.read(path).then((bytes) => parseStainingTemplate(bytes, kind))
    stainingTemplateCache.set(key, pending)
  }
  return pending
}

function loadEquipmentParameters(reader: LocalAssetReader, sourceKey: string): Promise<ArrayBuffer> {
  let pending = equipmentParameterCache.get(sourceKey)
  if (!pending) {
    pending = reader.read(EQUIPMENT_PARAMETER_PATH)
    equipmentParameterCache.set(sourceKey, pending)
  }
  return pending
}

async function loadRequest(
  reader: LocalAssetReader,
  sourceKey: string,
  request: MaterialLoadRequest,
): Promise<MaterialLoadResult> {
  const materials: MaterialLoadResult['materials'] = {}
  const errors: string[] = []
  const diagnostics: string[] = []
  let materialId = request.variant ?? 1
  let attributeMask: number | undefined
  let vfxId: number | undefined
  let materialAnimationId: number | undefined
  let resolvedMaterialAnimationPath: string | undefined
  let decodedMaterialAnimation: MaterialLoadResult['materialAnimation']
  let resolvedVfxPath: string | undefined
  let vfxTextures: MaterialLoadResult['vfxTextures']
  let decodedVfx: MaterialLoadResult['vfx']
  let facePaintTexture: MaterialLoadResult['facePaintTexture']
  let headHairHidden: boolean | undefined
  let headScalpHidden: boolean | undefined
  let handHideElbow: boolean | undefined
  let handHideForearm: boolean | undefined
  if (request.imcPath && request.slot && request.variant !== undefined) {
    try {
      const entry = readImcEntry(await reader.read(request.imcPath), request.slot, request.variant)
      materialId = entry.materialId
      attributeMask = entry.attributeMask
      vfxId = entry.vfxId
      materialAnimationId = entry.materialAnimationId
      diagnostics.push(
        `equipment IMC effects: vfxId=${vfxId} materialAnimationId=${materialAnimationId}`,
      )
    } catch (error) {
      const message = `[imc] ${request.imcPath}: ${error instanceof Error ? error.message : String(error)}`
      if (request.imcOptional) diagnostics.push(message)
      else errors.push(message)
    }
  }
  if (request.slot === 'head' && request.equipmentSetId !== undefined) {
    try {
      const visibility = headEquipmentVisibility(
        await loadEquipmentParameters(reader, sourceKey),
        request.equipmentSetId,
      )
      headHairHidden = visibility.hairHidden
      headScalpHidden = visibility.hideScalp && !visibility.showHairOverride
      diagnostics.push(
        `head EQP: ${EQUIPMENT_PARAMETER_PATH} set=${request.equipmentSetId} hideScalp=${visibility.hideScalp} hideHair=${visibility.hideHair} showOverride=${visibility.showHairOverride} resolvedHairHidden=${visibility.hairHidden}`,
      )
    } catch (error) {
      // EQP is optional here because some browser selections do not expose
      // resident metadata files. The dressing room still offers an override.
      diagnostics.push(`head EQP unavailable: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  if (request.slot === 'hands' && request.equipmentSetId !== undefined) {
    try {
      const visibility = handEquipmentVisibility(await loadEquipmentParameters(reader, sourceKey), request.equipmentSetId)
      handHideElbow = visibility.hideElbow
      handHideForearm = visibility.hideForearm
      diagnostics.push(`hand EQP: hideElbow=${visibility.hideElbow} hideForearm=${visibility.hideForearm}`)
    } catch (error) {
      diagnostics.push(`hand EQP unavailable: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  if (vfxId) {
    resolvedVfxPath = equipmentVfxPath(request.modelPath, vfxId)
    if (resolvedVfxPath) {
      try {
        const avfx = await reader.read(resolvedVfxPath)
        decodedVfx = decodeAvfx(avfx)
        const references = decodedVfx.textures
        vfxTextures = []
        for (const path of references) {
          try {
            vfxTextures.push({ path, texture: await loadTexture(reader, sourceKey, path) })
          } catch (error) {
            diagnostics.push(`AVFX texture unavailable: ${path} — ${error instanceof Error ? error.message : String(error)}`)
          }
        }
        const animatedTextureLayers = decodedVfx.particles.flatMap((particle) => particle.colorTextures).filter((binding) => binding.textureIndices.length > 1).length
        const paletteLayers = decodedVfx.particles.filter((particle) => particle.paletteTexture?.enabled).length
        const normalLayers = decodedVfx.particles.filter((particle) => particle.normalTexture?.enabled).length
        const distortionLayers = decodedVfx.particles.filter((particle) => particle.distortionTexture?.enabled).length
        diagnostics.push(`equipment AVFX: path=${resolvedVfxPath} bytes=${avfx.byteLength} emitters=${decodedVfx.emitters.length} particles=${decodedVfx.particles.length} models=${decodedVfx.models.length} textures=${references.length} decodedTextures=${vfxTextures.length} animatedTextureLayers=${animatedTextureLayers} paletteLayers=${paletteLayers} normalLayers=${normalLayers} distortionLayers=${distortionLayers} unsupportedParticleTypes=${decodedVfx.unsupportedParticleTypes.join(',') || 'none'}`)
      } catch (error) {
        diagnostics.push(`equipment AVFX unavailable: ${resolvedVfxPath} — ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }

  if (materialAnimationId) {
    resolvedMaterialAnimationPath = equipmentMaterialAnimationPath(request.modelPath, materialAnimationId)
    if (resolvedMaterialAnimationPath) {
      try {
        const [pap, skeleton] = await Promise.all([
          reader.read(resolvedMaterialAnimationPath),
          reader.read(MATERIAL_ANIMATION_SKELETON_PATH),
        ])
        decodedMaterialAnimation = decodeMaterialAnimation(pap, skeleton, resolvedMaterialAnimationPath)
        diagnostics.push(
          `equipment material animation: path=${resolvedMaterialAnimationPath} name=${decodedMaterialAnimation.name} duration=${decodedMaterialAnimation.duration.toFixed(3)}s frames=${decodedMaterialAnimation.times.length} tracks=${decodedMaterialAnimation.tracks.map((track) => track.name).join(',')}`,
        )
      } catch (error) {
        diagnostics.push(`equipment material animation unavailable: ${resolvedMaterialAnimationPath} â€” ${error instanceof Error ? error.message : String(error)}`)
      }
    } else {
      diagnostics.push(`equipment material animation IMC id=${materialAnimationId} has no supported path for ${request.modelPath}`)
    }
  }

  if (request.facePaintId && request.facePaintId > 0) {
    const path = `chara/common/texture/decal_face/_decal_${request.facePaintId}.tex`
    try {
      facePaintTexture = { path, texture: await loadTexture(reader, sourceKey, path) }
      diagnostics.push(`face paint: id=${request.facePaintId} path=${path} size=${facePaintTexture.texture.width}x${facePaintTexture.texture.height}`)
    } catch (error) {
      errors.push(`[face-paint] ${path}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  for (const materialReference of request.materialPaths) {
    try {
      const materialFile = await readFirst(reader, materialCandidates(request, materialReference, materialId))
      const parsed = parseMtrl(materialFile.bytes)
      const shader = parsed.shaderPackage.toLowerCase()
      const captureDiagnostics = Boolean(request.slot)
        || request.modelPath.includes('/obj/face/')
      const materialDiagnostics: string[] = captureDiagnostics ? [
        `material ${materialReference}`,
        `  model: ${request.modelPath}`,
        `  resolved MTRL: ${materialFile.path}`,
        `  shader: ${parsed.shaderPackage || '(empty)'}`,
        `  shader flags: 0x${parsed.shaderFlags.toString(16).padStart(8, '0')} translucent=${parsed.translucent} renderBackfaces=${parsed.renderBackfaces}`,
        `  IMC: variant=${request.variant ?? 'n/a'} materialId=${materialId} attributeMask=${attributeMask ?? 'n/a'} vfxId=${vfxId ?? 'n/a'} materialAnimationId=${materialAnimationId ?? 'n/a'}`,
        `  color table: ${parsed.colorTable ? `${parsed.colorTable.kind} ${parsed.colorTable.rows.length} rows` : 'none'}`,
        `  dyes: channel1=${request.stains?.[0] ?? 0} channel2=${request.stains?.[1] ?? 0} dyeRows=${parsed.dyeTable?.filter((row) => row.flags !== 0).length ?? 0}`,
        '  declared samplers:',
        ...parsed.textures.map((texture) => (
          `    ${texture.role} sampler=${samplerLabel(texture.samplerId)} priority=${materialTexturePriority(texture)} path=${texture.path}`
        )),
      ] : []
      const decoded = {
        path: materialFile.path,
        shaderPackage: parsed.shaderPackage,
        alphaMode: materialAlphaMode(parsed.shaderPackage, materialReference, parsed.shaderFlags),
        renderBackfaces: parsed.renderBackfaces,
        shaderFlags: parsed.shaderFlags,
        textures: {},
      } as MaterialLoadResult['materials'][string]
      const textureReferences = [...parsed.textures]
        .sort((left, right) => materialTexturePriority(right) - materialTexturePriority(left))
      for (const textureReference of textureReferences) {
        if (!textureReference.path) continue
        const role = textureReference.role
        if (!(['diffuse', 'normal', 'mask', 'specular', 'index'] as TextureRole[]).includes(role)) continue
        if (decoded.textures[role as keyof typeof decoded.textures]) {
          if (captureDiagnostics) materialDiagnostics.push(`  skipped duplicate ${role}: ${textureReference.path}`)
          continue
        }
        try {
          const texture = await loadTexture(reader, sourceKey, textureReference.path)
          decoded.textures[role as keyof typeof decoded.textures] = texture
          if (captureDiagnostics) materialDiagnostics.push(`  selected ${role}: ${textureReference.path} — ${textureSummary(texture)}`)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          errors.push(`[tex:${role}] ${textureReference.path}: ${message}`)
          if (captureDiagnostics) materialDiagnostics.push(`  failed ${role}: ${textureReference.path} — ${message}`)
        }
      }
      let effectiveColorTable = parsed.colorTable
      if (effectiveColorTable && parsed.dyeTable && request.stains?.some((stain) => stain > 0)) {
        const stmPath = effectiveColorTable.kind === 'dawntrail' ? DAWNTRAIL_STAIN_TEMPLATE_PATH : LEGACY_STAIN_TEMPLATE_PATH
        try {
          const stainingTemplate = await loadStainingTemplate(reader, sourceKey, effectiveColorTable.kind)
          const stained = applyStains(effectiveColorTable, parsed.dyeTable, stainingTemplate, request.stains)
          const resolved = stained.appliedRows > 0 || !request.stainColors
            ? stained
            : applyStainColors(effectiveColorTable, parsed.dyeTable, request.stains, request.stainColors)
          effectiveColorTable = resolved.table
          if (captureDiagnostics) materialDiagnostics.push(`  STM: ${stmPath} appliedRows=${stained.appliedRows}`)
          if (captureDiagnostics && resolved !== stained) materialDiagnostics.push(`  fallback dye colors: appliedRows=${resolved.appliedRows}`)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          if (request.stainColors) {
            const fallback = applyStainColors(effectiveColorTable, parsed.dyeTable, request.stains, request.stainColors)
            effectiveColorTable = fallback.table
            if (captureDiagnostics) materialDiagnostics.push(`  fallback dye colors: appliedRows=${fallback.appliedRows}`)
            if (fallback.appliedRows === 0) errors.push(`[stm] ${stmPath}: ${message}`)
          } else {
            errors.push(`[stm] ${stmPath}: ${message}`)
          }
          if (captureDiagnostics) materialDiagnostics.push(`  failed STM: ${stmPath} — ${message}`)
        }
      }
      if (effectiveColorTable) {
        if (usesCharacterColorTable(shader)) {
          const baked = bakeCharacterMaterial(effectiveColorTable, decoded.textures, shader)
          if (baked) Object.assign(decoded.textures, baked)
        }
        decoded.colorTableRows = effectiveColorTable.rows.length
        decoded.dyeableRows = parsed.dyeTable?.filter((row) => row.flags !== 0).length ?? 0
      }
      if (shader === 'hair.shpk') {
        const baked = bakeHairMaterial(decoded.textures.normal, decoded.textures.mask)
        if (baked) Object.assign(decoded.textures, baked)
      } else if (shader === 'iris.shpk') {
        const diffuse = bakeIrisMaterial(decoded.textures.diffuse, decoded.textures.mask)
        if (diffuse) decoded.textures.diffuse = diffuse
      } else if (shader === 'skin.shpk') {
        const skinColorMask = extractSkinColorMask(decoded.textures.normal)
        const lipMask = extractSkinLipMask(decoded.textures.normal)
        const normal = bakeSkinNormal(decoded.textures.normal)
        if (skinColorMask) decoded.textures.skinColorMask = skinColorMask
        if (lipMask) decoded.textures.lipMask = lipMask
        if (normal) decoded.textures.normal = normal
      } else if (shader === 'charactertattoo.shpk') {
        const baked = bakeTattooMaterial(decoded.textures.normal)
        if (baked) Object.assign(decoded.textures, baked)
      }
      if (captureDiagnostics) {
        materialDiagnostics.push(
          `  final diffuse: ${textureSummary(decoded.textures.diffuse)}`,
          `  final normal: ${textureSummary(decoded.textures.normal)}`,
          `  final mask: ${textureSummary(decoded.textures.mask)}`,
          `  final index: ${textureSummary(decoded.textures.index)}`,
          `  final ao: ${textureSummary(decoded.textures.ao)}`,
          `  final roughness: ${textureSummary(decoded.textures.roughness)}`,
          `  final metalness: ${textureSummary(decoded.textures.metalness)}`,
          `  final specular color: ${textureSummary(decoded.textures.specularColor)}`,
          `  final specular intensity: ${textureSummary(decoded.textures.specularIntensity)}`,
          `  final skin color mask: ${textureSummary(decoded.textures.skinColorMask)}`,
          `  final lip mask: ${textureSummary(decoded.textures.lipMask)}`,
        )
        diagnostics.push(materialDiagnostics.join('\n'))
      }
      materials[normalizedMaterialKey(materialReference)] = decoded
    } catch (error) {
      errors.push(`[mtrl] ${materialReference}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  return {
    modelPath: request.modelPath,
    materials,
    errors,
    diagnostics,
    attributeMask,
    ...(vfxId !== undefined ? { vfxId } : {}),
    ...(materialAnimationId !== undefined ? { materialAnimationId } : {}),
    ...(resolvedMaterialAnimationPath ? { materialAnimationPath: resolvedMaterialAnimationPath } : {}),
    ...(decodedMaterialAnimation ? { materialAnimation: decodedMaterialAnimation } : {}),
    ...(resolvedVfxPath ? { vfxPath: resolvedVfxPath } : {}),
    ...(vfxTextures?.length ? { vfxTextures } : {}),
    ...(decodedVfx ? { vfx: decodedVfx } : {}),
    ...(facePaintTexture ? { facePaintTexture } : {}),
    ...(headHairHidden !== undefined ? { headHairHidden } : {}),
    ...(headScalpHidden !== undefined ? { headScalpHidden } : {}),
    ...(handHideElbow !== undefined ? { handHideElbow } : {}),
    ...(handHideForearm !== undefined ? { handHideForearm } : {}),
  }
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
