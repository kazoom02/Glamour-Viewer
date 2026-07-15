export interface SharedSet {
  name: string
  race?: string
  items: string[]
}

function toBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  bytes.forEach((byte) => (binary += String.fromCharCode(byte)))
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

function fromBase64Url(value: string): string {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
  const binary = atob(padded)
  return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)))
}

export function encodeSharedSet(set: SharedSet): string {
  return toBase64Url(JSON.stringify(set))
}

export function readSharedSet(hash = window.location.hash): SharedSet | null {
  const match = hash.match(/^#\/set\/([A-Za-z0-9_-]+)$/)
  if (!match?.[1]) return null

  try {
    const candidate = JSON.parse(fromBase64Url(match[1])) as Partial<SharedSet>
    if (typeof candidate.name !== 'string' || !Array.isArray(candidate.items)) return null
    if (!candidate.items.every((item) => typeof item === 'string')) return null
    return {
      name: candidate.name.slice(0, 100),
      race: typeof candidate.race === 'string' ? candidate.race.slice(0, 100) : undefined,
      items: candidate.items.slice(0, 20).map((item) => item.slice(0, 200)),
    }
  } catch {
    return null
  }
}
