import { useEffect, useState } from 'react'
import type { ArmorItem } from '../catalog/types'
import { fetchMarketBoard, wikiItemUrl, type MarketBoard } from '../catalog/universalis'

interface Props {
  item: ArmorItem
  /** World, data-center, or region name; undefined until the user picks one. */
  scope?: string
}

type LoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; data: MarketBoard | null }
  | { status: 'error'; message: string }

const gil = (value: number) => Math.round(value).toLocaleString()

function relativeTime(ms: number): string {
  if (!ms) return 'unknown'
  const seconds = Math.max(0, (Date.now() - ms) / 1000)
  if (seconds < 90) return 'just now'
  const minutes = seconds / 60
  if (minutes < 90) return `${Math.round(minutes)}m ago`
  const hours = minutes / 60
  if (hours < 36) return `${Math.round(hours)}h ago`
  return `${Math.round(hours / 24)}d ago`
}

function Prices({ data, scope }: { data: MarketBoard; scope: string }) {
  const nq = data.minPriceNQ || 0
  const hq = data.minPriceHQ || 0
  if (!nq && !hq) return <span className="market-info-hint">No current listings on {scope}.</span>
  const velocity = (data.nqSaleVelocity || 0) + (data.hqSaleVelocity || 0)
  return (
    <div className="market-prices">
      <div className="market-price-row">
        {nq > 0 && <span><b>{gil(nq)}</b> <i>gil · NQ</i></span>}
        {hq > 0 && <span><b>{gil(hq)}</b> <i>gil · HQ</i></span>}
      </div>
      <small>
        cheapest on {scope} · {data.listingsCount || data.listings.length} listing{(data.listingsCount || data.listings.length) === 1 ? '' : 's'}
        {velocity > 0 ? ` · ~${velocity.toFixed(1)}/day` : ''}
      </small>
      <small className="market-info-updated">updated {relativeTime(data.lastUploadTime)}</small>
    </div>
  )
}

/** Market-board price for the item on the selected scope, plus a wiki link. */
export default function MarketInfo({ item, scope }: Props) {
  const [state, setState] = useState<LoadState>({ status: 'idle' })

  useEffect(() => {
    if (!scope) { setState({ status: 'idle' }); return }
    let active = true
    setState({ status: 'loading' })
    fetchMarketBoard(scope, item.id)
      .then((data) => { if (active) setState({ status: 'ready', data }) })
      .catch((reason) => { if (active) setState({ status: 'error', message: reason instanceof Error ? reason.message : 'Market lookup failed.' }) })
    return () => { active = false }
  }, [item.id, scope])

  return (
    <div className="market-info" role="group" aria-label={`Market and wiki for ${item.name}`}>
      <div className="market-info-body">
        <span className="market-info-title">Market board</span>
        {!scope ? (
          <span className="market-info-hint">Pick a world or data center above to see prices.</span>
        ) : state.status === 'loading' || state.status === 'idle' ? (
          <span className="market-info-hint">Checking Universalis…</span>
        ) : state.status === 'error' ? (
          <span className="market-info-hint">{state.message}</span>
        ) : !state.data ? (
          <span className="market-info-hint">Not sold on the market board.</span>
        ) : (
          <Prices data={state.data} scope={scope} />
        )}
      </div>
      
    </div>
  )
}
