import { createLocalAssetReader } from './src/asset-source/sqpack.ts'
import { decodePap } from './src/asset-source/pap.ts'

async function run() {
  const reader = createLocalAssetReader()
  const bytes = await reader.read('chara/human/c0101/animation/a0001/bt_common/emote/instrument03.pap')
  const anim = decodePap(bytes, 'instrument03', 30)
  console.log('Track count:', anim.tracks.length)
  for (const t of anim.tracks) {
    if (t.boneName && (t.boneName.includes('kami') || t.boneName.includes('f_'))) {
      console.log('Hair/face track found:', t.boneName, t.boneIndex)
    } else if (!t.boneName) {
      console.log('No name track:', t.boneIndex)
    }
  }
}
run().catch(console.error)
