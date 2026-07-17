import fs from 'fs'
let src = fs.readFileSync('src/viewer/idleAnimation.ts', 'utf8')
src = src.replace(
  'clip: new THREE.AnimationClip(animation.name || \\\'Idle\\\', animation.duration, tracks).optimize(),',
  'clip: (() => { const c = new THREE.AnimationClip(animation.name || \\\'Idle\\\', animation.duration, tracks).optimize(); if (animation.blendHint === \\\'additive\\\') { THREE.AnimationUtils.makeClipAdditive(c); } return c; })(),'
)
fs.writeFileSync('src/viewer/idleAnimation.ts', src)
