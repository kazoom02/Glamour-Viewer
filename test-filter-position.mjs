import fs from 'fs'

// Update DefaultCharacterPreview
let preview = fs.readFileSync('src/viewer/DefaultCharacterPreview.tsx', 'utf8')
preview = preview.replace(
  'const addClip = (name: string, clip: THREE.AnimationClip) => {',
  'const addClip = (name: string, clip: THREE.AnimationClip) => {\n      // Drop translation tracks so exported emotes don’t stretch limbs.\n      // We keep n_root translations if present so locomotion works.\n      clip.tracks = clip.tracks.filter((track) => !track.name.endsWith(\\\'.position\\\') || track.name === \\\'n_root.position\\\')'
)
fs.writeFileSync('src/viewer/DefaultCharacterPreview.tsx', preview)

// Update ViewerCanvas
let canvas = fs.readFileSync('src/viewer/ViewerCanvas.tsx', 'utf8')
canvas = canvas.replace(
  'retargeted.tracks = retargeted.tracks.filter((track) => track.name !== \\\'n_root.position\\\')',
  '// Drop all translations except for weapons/ik, to prevent limb stretching.\\n            // We drop n_root to keep them centered in the preview.\\n            retargeted.tracks = retargeted.tracks.filter((track) => {\\n              if (!track.name.endsWith(\\\'.position\\\')) return true\\n              const boneName = track.name.split(\\\'.\\\')[0]\\n              return boneName.startsWith(\\\'j_buki_\\\') || boneName.startsWith(\\\'n_buki_\\\') || boneName.startsWith(\\\'ik_\\\') || boneName.startsWith(\\\'iv_\\\')\\n            })'
)
fs.writeFileSync('src/viewer/ViewerCanvas.tsx', canvas)

