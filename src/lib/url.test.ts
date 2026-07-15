import { describe, expect, it } from 'vitest'
import { manifestUrl, validateAssetBaseUrl } from './url'

describe('validateAssetBaseUrl', () => {
  it('accepts and normalizes HTTPS URLs', () => {
    expect(validateAssetBaseUrl(' https://assets.example/cache ')).toEqual({
      ok: true,
      url: new URL('https://assets.example/cache/'),
      normalized: 'https://assets.example/cache/',
    })
  })

  it('rejects non-network schemes', () => {
    expect(validateAssetBaseUrl('file:///game/sqpack')).toEqual({
      ok: false,
      error: 'The asset URL must use http:// or https://.',
    })
  })

  it('rejects embedded bucket credentials', () => {
    expect(validateAssetBaseUrl('https://token:secret@assets.example/cache/')).toEqual({
      ok: false,
      error: 'Do not put credentials in the asset URL.',
    })
  })

  it('resolves a manifest without escaping the cache path', () => {
    expect(manifestUrl('https://assets.example/cache/')).toBe('https://assets.example/cache/manifest.json')
  })
})
