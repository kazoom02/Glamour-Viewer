import { decodeSklb } from './src/asset-source/sklb.ts'
import { attachSkeleton } from './src/asset-source/sklb.ts'
import { createLocalAssetReader } from './src/asset-source/sqpack.ts'

async function run() {
  const reader = createLocalAssetReader()
  const base = await reader.read('chara/human/c1201/skeleton/base/b0001/skl_c1201b0001.sklb')
  const hair = await reader.read('chara/human/c1201/obj/hair/h0001/skeleton/skl_c1201h0001.sklb')
  let sk = attachSkeleton(decodeSklb(base), decodeSklb(hair), 'j_kao')
  console.log(sk.bones.filter(b => b.isAuxiliary).length)
}
run().catch(console.error)
