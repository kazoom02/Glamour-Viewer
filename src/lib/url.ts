export type UrlValidation =
  | { ok: true; url: URL; normalized: string }
  | { ok: false; error: string }

export function validateAssetBaseUrl(value: string): UrlValidation {
  const trimmed = value.trim()
  if (!trimmed) return { ok: false, error: 'Enter the base URL of your converted cache.' }

  try {
    const url = new URL(trimmed)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return { ok: false, error: 'The asset URL must use http:// or https://.' }
    }
    if (url.username || url.password) {
      return { ok: false, error: 'Do not put credentials in the asset URL.' }
    }
    url.hash = ''
    url.search = ''
    if (!url.pathname.endsWith('/')) url.pathname += '/'
    return { ok: true, url, normalized: url.toString() }
  } catch {
    return { ok: false, error: 'Enter a complete, valid http(s) URL.' }
  }
}

export function manifestUrl(baseUrl: string): string {
  return new URL('manifest.json', baseUrl).toString()
}
