import type { MaterialLoadRequest } from './materialTypes'

const CHARACTER_OBJECTS: Record<string, string> = {
  b: 'body',
  f: 'face',
  h: 'hair',
  t: 'tail',
  z: 'zear',
}

const FEMALE_RACES = new Set(['0201', '0401', '0601', '0801', '1001', '1201', '1401', '1601', '1801'])

function sharedHairMaterial(modelPath: string, filename: string): string | undefined {
  const match = /chara\/human\/c(\d{4})\/obj\/hair\/h(\d{4})\/model\//i.exec(modelPath)
  if (!match) return undefined
  const [, race, rawId] = match
  const hairId = Number(rawId)
  if (race === '1501' || race === '1601') return undefined // Hrothgar hair is never shared.
  const miqoteSpecific = hairId >= 101 && hairId <= 115
  const globallyShared = hairId >= 116 && hairId <= 200
  if (!globallyShared && !(miqoteSpecific && race !== '0701' && race !== '0801')) return undefined
  const materialRace = FEMALE_RACES.has(race!) ? '0201' : '0101'
  const sharedFilename = filename.replace(/^mt_c\d{4}h\d{4}/i, `mt_c${materialRace}h${rawId}`)
  return `chara/human/c${materialRace}/obj/hair/h${rawId}/material/v0001/${sharedFilename}`
}

function variantDirectory(variant: number): string {
  return `v${Math.max(1, variant).toString().padStart(4, '0')}`
}

/** Resolves the abbreviated material names stored in MDL files to game paths. */
export function materialCandidates(request: MaterialLoadRequest, reference: string, materialId: number): string[] {
  const normalized = reference.replaceAll('\\', '/').replace(/^\/+/, '')
  const filename = normalized.split('/').at(-1)
  if (!filename) return []
  const candidates: string[] = []
  if (normalized.includes('/') && normalized.toLowerCase().endsWith('.mtrl')) candidates.push(normalized)

  const sharedHair = sharedHairMaterial(request.modelPath, filename)
  if (sharedHair) candidates.push(sharedHair)

  const named = /^mt_c(\d{4})([a-z])(\d{4})(?:_|\.)/i.exec(filename)
  if (named) {
    const [, race, kind, id] = named
    const lowerKind = kind!.toLowerCase()
    if (lowerKind === 'e') {
      candidates.push(`chara/equipment/e${id}/material/${variantDirectory(materialId)}/${filename}`)
    } else if (lowerKind === 'a') {
      candidates.push(`chara/accessory/a${id}/material/${variantDirectory(materialId)}/${filename}`)
    } else if (CHARACTER_OBJECTS[lowerKind]) {
      const root = `chara/human/c${race}/obj/${CHARACTER_OBJECTS[lowerKind]}/${lowerKind}${id}/material`
      candidates.push(`${root}/v0001/${filename}`, `${root}/${filename}`)
    }
  }

  // Weapon materials name their own set/base (mt_w{set}b{base}). Resolve from the
  // filename, not the model folder: the off-hand blade of a dual-wield weapon is a
  // separate model set that references the MAIN set's material (e.g. w1851 model →
  // mt_w1801… material), so the model-relative folder would miss it.
  const weaponNamed = /^mt_w(\d{4})b(\d{4})/i.exec(filename)
  if (weaponNamed) {
    const [, set, base] = weaponNamed
    const root = `chara/weapon/w${set}/obj/body/b${base}/material`
    candidates.push(`${root}/${variantDirectory(materialId)}/${filename}`, `${root}/v0001/${filename}`)
  }

  // Keep the model-relative paths as fallbacks for uncommon monster and demi-human materials.
  const modelRoot = request.modelPath.replace(/\/model\/[^/]+$/i, '')
  if (/^chara\/equipment\/e\d{4}$/i.test(modelRoot)) {
    candidates.push(`${modelRoot}/material/${variantDirectory(materialId)}/${filename}`)
  } else {
    candidates.push(`${modelRoot}/material/${variantDirectory(materialId)}/${filename}`, `${modelRoot}/material/v0001/${filename}`, `${modelRoot}/material/${filename}`)
  }
  return [...new Set(candidates)]
}
