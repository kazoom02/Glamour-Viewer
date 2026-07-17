import fs from 'fs'
let src = fs.readFileSync('src/asset-source/animation.worker.ts', 'utf8')
src = src.replace('error instanceof Error ? error.message : String(error)', 'error instanceof Error ? error.stack : String(error)')
src = src.replace('error instanceof Error ? error.message : \\\'The animation worker failed.\\\'', 'error instanceof Error ? error.stack : \\\'The animation worker failed.\\\'')
fs.writeFileSync('src/asset-source/animation.worker.ts', src)
