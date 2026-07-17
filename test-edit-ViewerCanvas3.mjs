import fs from 'fs'
let src = fs.readFileSync('src/viewer/ViewerCanvas.tsx', 'utf8')

// Add AdditiveAnimationBlendMode to idle loop
src = src.replace(
  '            const action = activeIdleMixer.clipAction(clip)\n            action.setLoop(THREE.LoopRepeat, Infinity)',
  '            const action = activeIdleMixer.clipAction(clip)\n            if (decodedAnimation.blendHint === \\\'additive\\\') {\n              action.blendMode = THREE.AdditiveAnimationBlendMode\n            }\n            action.setLoop(THREE.LoopRepeat, Infinity)'
)

// Add AdditiveAnimationBlendMode to playClipOnRig
src = src.replace(
  '            const action = mixer.clipAction(clip)\n            action.setLoop(THREE.LoopRepeat, Infinity)',
  '            const action = mixer.clipAction(clip)\n            if (blendHint === \\\'additive\\\') {\n              action.blendMode = THREE.AdditiveAnimationBlendMode\n            }\n            action.setLoop(THREE.LoopRepeat, Infinity)'
)

fs.writeFileSync('src/viewer/ViewerCanvas.tsx', src)
