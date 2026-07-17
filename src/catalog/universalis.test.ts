import { describe, expect, it } from 'vitest'
import { marketBoardUrl, wikiItemUrl } from './universalis'

describe('wikiItemUrl', () => {
  it('links to the FFXIV wiki with spaces as underscores', () => {
    expect(wikiItemUrl("Common Makai Harbinger's Battlegarb")).toBe(
      "https://ffxiv.consolegameswiki.com/wiki/Common_Makai_Harbinger's_Battlegarb",
    )
  })

  it('percent-encodes characters that are unsafe in a URL path', () => {
    expect(wikiItemUrl('Storm Sergeant & Co')).toBe(
      'https://ffxiv.consolegameswiki.com/wiki/Storm_Sergeant_%26_Co',
    )
  })
})

describe('marketBoardUrl', () => {
  it('targets a world/DC/region scope and the item id, listings only', () => {
    expect(marketBoardUrl('Aether', 12345)).toBe(
      'https://universalis.app/api/v2/Aether/12345?listings=8&entries=0',
    )
  })

  it('encodes multi-word or hyphenated scopes', () => {
    expect(marketBoardUrl('North-America', 44)).toBe(
      'https://universalis.app/api/v2/North-America/44?listings=8&entries=0',
    )
  })
})
