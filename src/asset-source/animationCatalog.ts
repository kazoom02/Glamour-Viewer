import { animationPapCandidates, type CharacterRaceCode } from './characterPlan'

// The animation catalog names FFXIV motion files by their in-game reference,
// `{weaponClass}-{sub}-{papFile}[-{internalTrack}]`. Those map to the SqPack path
// `chara/human/{race}/animation/a0001/{weaponClass}/{sub}/{papFile}.pap`, from which
// the named track is decoded. The bundled list is metadata (path names) only — every
// motion is decoded from the user's own local install; no game bytes are shipped.

export type AnimationCategory =
  | 'idle'
  | 'emotes'
  | 'movement'
  | 'stances'
  | 'performance'
  | 'limitbreak'
  | 'general'
  | 'crafting'
  | 'gathering'
  | 'combat'
  | 'events'

/** Display order and labels for the picker; 'advanced' categories are noisier. */
export const ANIMATION_CATEGORIES: ReadonlyArray<{ id: AnimationCategory; label: string; advanced?: boolean }> = [
  { id: 'idle', label: 'Idle & poses' },
  { id: 'emotes', label: 'Emotes' },
  { id: 'movement', label: 'Movement' },
  { id: 'stances', label: 'Battle stances' },
  { id: 'performance', label: 'Performance' },
  { id: 'limitbreak', label: 'Limit breaks' },
  { id: 'general', label: 'General' },
  { id: 'crafting', label: 'Crafting' },
  { id: 'gathering', label: 'Gathering' },
  { id: 'combat', label: 'Combat', advanced: true },
  { id: 'events', label: 'Events & misc', advanced: true },
]

export interface CatalogAnimation {
  /** Full catalog id, e.g. `bt_common-emote-sit`. Stable key for the picker. */
  id: string
  weaponClass: string
  weaponLabel: string
  sub: string
  papFile: string
  /** Internal track name inside the PAP, or '' when the file is a single clip. */
  internal: string
  category: AnimationCategory
  /** Human-facing motion name. */
  label: string
}

/** Weapon/tool classes as weapon *types* (not jobs, which share weapons). */
const WEAPON_CLASS_LABELS: Record<string, string> = {
  bt_common: 'Common (no weapon)',
  bt_emp_emp: 'Unarmed',
  bt_2ax_emp: 'Greataxe',
  bt_2bk_emp: 'Grimoire',
  bt_2bw_emp: 'Bow',
  bt_2gb_emp: 'Gunblade',
  bt_2gl_emp: 'Star globe',
  bt_2gn_emp: 'Firearm',
  bt_2kt_emp: 'Katana',
  bt_2rp_emp: 'Rapier',
  bt_2sp_emp: 'Polearm',
  bt_2sw_emp: 'Greatsword',
  bt_clw_clw: 'Fist weapons',
  bt_dgr_dgr: 'Daggers',
  bt_nin_nin: 'Ninja blades',
  bt_swd_emp: 'Sword & shield',
  bt_swd_sld: 'Sword & shield',
  bt_stf_emp: 'Staff',
  bt_stf_sld: 'Staff',
  bt_rod_emp: 'Fishing rod',
  bt_fsh_emp: 'Fishing rod',
  bt_min_emp: "Miner's pickaxe",
  bt_alc_emp: "Alchemist's tools",
  bt_arm_emp: "Armorer's tools",
  bt_blk_emp: "Blacksmith's tools",
  bt_cok_emp: "Culinarian's tools",
  bt_gld_emp: "Goldsmith's tools",
  bt_lth_emp: "Leatherworker's tools",
  bt_wod_emp: "Carpenter's tools",
  bt_sew_emp: "Weaver's tools",
}

export function weaponClassLabel(weaponClass: string): string {
  return WEAPON_CLASS_LABELS[weaponClass] ?? weaponClass
}

interface ParsedAnimationId {
  weaponClass: string
  sub: string
  papFile: string
  internal: string
}

/** Splits a catalog id into `{weaponClass}/{sub}/{papFile}` plus an internal track. */
export function parseAnimationId(id: string): ParsedAnimationId {
  const tokens = id.split('-')
  const rest = tokens.slice(2).filter((token) => token.length > 0)
  return {
    weaponClass: tokens[0] ?? '',
    sub: tokens[1] ?? '',
    papFile: rest[0] ?? '',
    internal: rest.slice(1).join('-'),
  }
}

function categoryOf(sub: string, papFile: string): AnimationCategory {
  switch (sub) {
    case 'emote':
    case 'emote_sp':
    case 'emote_ajust':
      return 'emotes'
    case 'idle_sp':
      return 'idle'
    case 'resident':
      if (papFile.startsWith('move')) return 'movement'
      if (papFile === 'sub') return 'stances'
      if (papFile === 'craft') return 'crafting'
      return 'idle'
    case 'normal':
    case 'human_sp':
      return 'general'
    case 'limitbreak':
      return 'limitbreak'
    case 'music':
      return 'performance'
    case 'craft':
      return 'crafting'
    case 'gather':
    case 'fishing':
    case 'diving_gather':
    case 'fishing_chair':
      return 'gathering'
    case 'ability':
    case 'ws':
    case 'battle':
      return 'combat'
    default:
      return 'events'
  }
}

function motionLabel(parsed: ParsedAnimationId): string {
  const base = parsed.internal || parsed.papFile || parsed.sub
  return base.replace(/_/g, ' ').trim() || parsed.sub
}

/** Builds a catalog entry from a raw id (parses, categorizes, labels). */
export function toCatalogAnimation(id: string): CatalogAnimation {
  const parsed = parseAnimationId(id)
  return {
    id,
    weaponClass: parsed.weaponClass,
    weaponLabel: weaponClassLabel(parsed.weaponClass),
    sub: parsed.sub,
    papFile: parsed.papFile,
    internal: parsed.internal,
    category: categoryOf(parsed.sub, parsed.papFile),
    label: motionLabel(parsed),
  }
}

/** In-game `.pap` paths to try for an entry, newest race first (with fallbacks). */
export function catalogAnimationCandidates(entry: CatalogAnimation, raceCode: CharacterRaceCode): string[] {
  return animationPapCandidates(raceCode, entry.weaponClass, entry.sub, entry.papFile)
}

interface RawCatalog {
  version: number
  referenceRace: string
  count: number
  animations: string[]
}

let catalogPromise: Promise<CatalogAnimation[]> | undefined

/** Lazily fetches and parses the bundled animation catalog (cached on success). */
export function loadAnimationCatalog(): Promise<CatalogAnimation[]> {
  catalogPromise ??= (async () => {
    const response = await fetch(`${import.meta.env.BASE_URL}animation-catalog.json`)
    if (!response.ok) throw new Error(`The animation catalog failed to load (${response.status}).`)
    const raw = (await response.json()) as RawCatalog
    if (!Array.isArray(raw.animations)) throw new Error('The animation catalog is malformed.')
    return raw.animations.map(toCatalogAnimation)
  })().catch((reason) => {
    // Don't cache a transient failure — allow the next mount to retry.
    catalogPromise = undefined
    throw reason
  })
  return catalogPromise
}
