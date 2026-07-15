export type AssetSource =
  | {
      kind: 'local'
      label: string
      fileCount?: number
      totalBytes?: number
      access: 'handle' | 'fallback'
    }
  | {
      kind: 'remote'
      label: string
      baseUrl: string
      fileCount?: number
      totalBytes?: number
    }

export interface CacheManifest {
  version: number
  files?: Array<{ path: string; bytes?: number }>
}
