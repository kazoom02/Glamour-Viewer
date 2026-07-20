import { EQUIPMENT_SLOTS, type ArmorItem, type EquipmentSlot } from './types'
import { continueArmorSearch, fetchClassJobCategories, searchArmor } from './xivapi'

// Session-lifetime caches. XIVAPI catalog metadata (names, icons, model ids, item
// levels, class categories) is identical for every user and every asset source,
// so a plain module-level cache is safe: each slot's full catalog is fetched at
// most once per page load, after which reopening a slot — or searching, sorting,
// and filtering it — is instant and offline.

export interface SlotLoadHandlers {
  /** Fired as pages stream in for the first (in-flight) load, then once at the end. */
  onProgress?: (items: ArmorItem[], pagesLoaded: number) => void
}

const completed = new Map<EquipmentSlot, ArmorItem[]>()
const inflight = new Map<EquipmentSlot, Promise<ArmorItem[]>>()
let categoriesPromise: Promise<Map<number, Set<string>>> | null = null
let dataVersion: string | undefined

/** The ClassJobCategory id → enabled job columns lookup, loaded once. */
export function getClassJobCategories(): Promise<Map<number, Set<string>>> {
  if (!categoriesPromise) {
    categoriesPromise = fetchClassJobCategories().catch((reason) => {
      categoriesPromise = null // allow a later retry
      throw reason
    })
  }
  return categoriesPromise
}

async function loadAllPages(slot: EquipmentSlot, handlers: SlotLoadHandlers): Promise<ArmorItem[]> {
  const itemsById = new Map<number, ArmorItem>()
  const seenCursors = new Set<string>()
  let page = await searchArmor('', slot)
  let pagesLoaded = 0
  while (true) {
    pagesLoaded += 1
    page.items.forEach((item) => itemsById.set(item.id, item))
    if (page.version) dataVersion = page.version
    handlers.onProgress?.([...itemsById.values()], pagesLoaded)
    const cursor = page.next
    if (!cursor) break
    if (seenCursors.has(cursor)) throw new Error('XIVAPI returned a repeated catalog cursor.')
    seenCursors.add(cursor)
    page = await continueArmorSearch(cursor, slot)
  }
  return [...itemsById.values()]
}

/**
 * Returns the complete catalog for a slot, loading it once and caching it. A
 * cache hit resolves synchronously-fast and still calls onProgress with the full
 * list (pagesLoaded = -1 signals "already cached").
 */
export function getSlotCatalog(slot: EquipmentSlot, handlers: SlotLoadHandlers = {}): Promise<ArmorItem[]> {
  const cached = completed.get(slot)
  if (cached) {
    handlers.onProgress?.(cached, -1)
    return Promise.resolve(cached)
  }
  const existing = inflight.get(slot)
  if (existing) {
    return existing.then((items) => {
      handlers.onProgress?.(items, -1)
      return items
    })
  }
  const promise = loadAllPages(slot, handlers)
  inflight.set(slot, promise)
  promise.then(
    (items) => {
      completed.set(slot, items)
      inflight.delete(slot)
    },
    () => {
      inflight.delete(slot)
    },
  )
  return promise
}

export function isSlotCached(slot: EquipmentSlot): boolean {
  return completed.has(slot)
}

/** Returns an already-loaded slot without introducing an asynchronous render. */
export function peekSlotCatalog(slot: EquipmentSlot): ArmorItem[] | undefined {
  return completed.get(slot)
}

/** Warms every slot in the background, one at a time to stay gentle on XIVAPI. */
export function prefetchAllSlots(): void {
  void EQUIPMENT_SLOTS.reduce<Promise<unknown>>(
    (chain, slot) => chain.then(() => (completed.has(slot) ? undefined : getSlotCatalog(slot).catch(() => undefined))),
    Promise.resolve(),
  )
}

export function catalogDataVersion(): string | undefined {
  return dataVersion
}
