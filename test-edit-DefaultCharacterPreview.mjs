import fs from 'fs'
let src = fs.readFileSync('src/viewer/DefaultCharacterPreview.tsx', 'utf8')
src = src.replace(
  'const [modelGltf, idleGltf] = await Promise.all([',
  `// Avoid crashing on empty GLBs (e.g. Git LFS issues)
        const fetchCheck = await Promise.all([fetch(MODEL_URL, {method: 'HEAD'}), fetch(IDLE_URL, {method: 'HEAD'})])
        if (Number(fetchCheck[0].headers.get('content-length')) < 1000) {
          throw new Error('Default character GLB is missing or empty.')
        }
        const [modelGltf, idleGltf] = await Promise.all([`
)
fs.writeFileSync('src/viewer/DefaultCharacterPreview.tsx', src)
