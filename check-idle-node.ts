import { readFileSync } from 'fs'
import { decodePap } from './src/asset-source/pap.ts'

const bytes = readFileSync('public/chara/human/c0101/animation/a0001/bt_common/resident/idle.pap')
const anim = decodePap(bytes.buffer, 'idle', 30)
let hasHair = false
for (const t of anim.tracks) {
  if (t.boneName && (t.boneName.includes('kami') || t.boneName.includes('f_'))) {
    console.log('Hair/face track found:', t.boneName)
    hasHair = true
  }
}
if (!hasHair) console.log("No hair tracks in idle.pap!")
