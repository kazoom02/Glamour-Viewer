import { createLocalAssetReader } from './src/asset-source/sqpack.ts'
import { decodePap } from './src/asset-source/pap.ts'

async function run() {
  const reader = createLocalAssetReader()
  const bytes = await reader.read('chara/human/c1201/animation/a0001/bt_common/resident/idle.pap')
  const anim = decodePap(bytes, 'idle', 30)
  for (const t of anim.tracks) {
    if (t.boneName && (t.boneName.includes('kami') || t.boneName.includes('f_'))) {
      console.log('Hair/face track found:', t.boneName)
    }
  }
}
run().catch(console.error)
