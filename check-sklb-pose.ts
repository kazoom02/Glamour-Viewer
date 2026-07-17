import { decodeSklb } from './src/asset-source/sklb.ts'
import { createLocalAssetReader } from './src/asset-source/sqpack.ts'

async function run() {
  const reader = createLocalAssetReader()
  const hair = await reader.read('chara/human/c0101/obj/hair/h0001/skeleton/skl_c0101h0001.sklb')
  const decoded = decodeSklb(hair)
  for (const bone of decoded.bones) {
    if (bone.name.includes('kami')) {
      console.log(bone.name, bone.rotation)
    }
  }
}
run().catch(console.error)
