import type { MaterialLoadRequest } from './materialTypes'

const CHARACTER_OBJECTS: Record<string, string> = {
  b: 'body',
  f: 'face',
  h: 'hair',
  t: 'tail',
  z: 'zear',
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

  // Keep the model-relative paths as fallbacks for uncommon monster and demi-human materials.
  const modelRoot = request.modelPath.replace(/\/model\/[^/]+$/i, '')
  if (/^chara\/equipment\/e\d{4}$/i.test(modelRoot)) {
    candidates.push(`${modelRoot}/material/${variantDirectory(materialId)}/${filename}`)
  } else {
    candidates.push(`${modelRoot}/material/${variantDirectory(materialId)}/${filename}`, `${modelRoot}/material/v0001/${filename}`, `${modelRoot}/material/${filename}`)
  }
  return [...new Set(candidates)]
}
