// Market-board pricing from the public Universalis API (https://docs.universalis.app/)
// and a link out to the community wiki. Both are catalog metadata only: read-only
// GET requests keyed by the game item id, no account or game data involved.

const UNIVERSALIS_BASE_URL = 'https://universalis.app/api/v2'

export interface UniversalisWorld {
  id: number
  name: string
}

export interface UniversalisDataCenter {
  name: string
  region: string
  worlds: number[]
}

export interface MarketListing {
  pricePerUnit: number
  quantity: number
  hq: boolean
  total: number
  worldName?: string
  retainerName?: string
}

export interface MarketBoard {
  itemID: number
  lastUploadTime: number
  listings: MarketListing[]
  /** Lowest current listing prices across the whole scope (0 when none). */
  minPrice: number
  minPriceNQ: number
  minPriceHQ: number
  currentAveragePrice: number
  nqSaleVelocity: number
  hqSaleVelocity: number
  listingsCount: number
  unitsForSale: number
}

/** Universalis accepts a world name, a data-center name, or a region as the scope. */
export function marketBoardUrl(scope: string, itemId: number): string {
  const path = `${encodeURIComponent(scope)}/${itemId}`
  return `${UNIVERSALIS_BASE_URL}/${path}?listings=8&entries=0`
}

/** The community (Gamer Escape) wiki page for an item name. */
export function wikiItemUrl(name: string): string {
  return `https://ffxiv.consolegameswiki.com/wiki/${encodeURIComponent(name.replace(/ /g, '_'))}`
}

let worldsPromise: Promise<UniversalisWorld[]> | undefined
export function fetchWorlds(): Promise<UniversalisWorld[]> {
  worldsPromise ??= fetch(`${UNIVERSALIS_BASE_URL}/worlds`, { headers: { Accept: 'application/json' }, mode: 'cors' })
    .then((response) => {
      if (!response.ok) throw new Error(`Universalis worlds HTTP ${response.status}.`)
      return response.json() as Promise<UniversalisWorld[]>
    })
    .catch((reason) => { worldsPromise = undefined; throw reason })
  return worldsPromise
}

let dataCentersPromise: Promise<UniversalisDataCenter[]> | undefined
export function fetchDataCenters(): Promise<UniversalisDataCenter[]> {
  dataCentersPromise ??= fetch(`${UNIVERSALIS_BASE_URL}/data-centers`, { headers: { Accept: 'application/json' }, mode: 'cors' })
    .then((response) => {
      if (!response.ok) throw new Error(`Universalis data-centers HTTP ${response.status}.`)
      return response.json() as Promise<UniversalisDataCenter[]>
    })
    .catch((reason) => { dataCentersPromise = undefined; throw reason })
  return dataCentersPromise
}

const marketCache = new Map<string, Promise<MarketBoard | null>>()

/**
 * Fetches the market board for one item on a scope (world/DC/region). Resolves to
 * `null` when the item is untradable or Universalis has no page for it (404),
 * cached per scope+item so re-hovering is instant.
 */
export function fetchMarketBoard(scope: string, itemId: number): Promise<MarketBoard | null> {
  const key = `${scope}:${itemId}`
  let request = marketCache.get(key)
  if (!request) {
    request = (async () => {
      const response = await fetch(marketBoardUrl(scope, itemId), { headers: { Accept: 'application/json' }, mode: 'cors' })
      if (response.status === 404) return null
      if (!response.ok) throw new Error(`Universalis HTTP ${response.status}.`)
      return (await response.json()) as MarketBoard
    })().catch((reason) => {
      marketCache.delete(key)
      throw reason
    })
    marketCache.set(key, request)
  }
  return request
}
