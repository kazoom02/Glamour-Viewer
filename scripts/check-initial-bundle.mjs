import { gzipSync } from 'node:zlib'
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const assetsDirectory = new URL('../dist/assets/', import.meta.url)
const files = await readdir(assetsDirectory)
const entryFiles = files.filter((file) => /^index-[\w-]+\.js$/.test(file))

if (entryFiles.length !== 1) {
  throw new Error(`Expected one initial JavaScript entry, found ${entryFiles.length}.`)
}

const entryPath = join(fileURLToPath(assetsDirectory), entryFiles[0])
const source = await readFile(entryPath)
const gzipBytes = gzipSync(source).byteLength
const targetBytes = 250 * 1024
const failureBytes = 400 * 1024

console.log(`Initial chunk: ${(gzipBytes / 1024).toFixed(1)} KiB gzipped (target < 250 KiB)`)

if (gzipBytes > failureBytes) {
  throw new Error('Initial JavaScript chunk exceeds the 400 KiB gzipped build limit.')
}

if (gzipBytes > targetBytes) {
  console.warn('Warning: initial JavaScript chunk exceeds the 250 KiB target.')
}
