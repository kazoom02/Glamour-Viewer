sed -i 's/const textureRoughness = textures.mask/const textureRoughness = textures.mask ? (legacyShader ? 1 - mask[1] \/ 255 : mask[1] \/ 255) : rowRoughness/g' src/asset-source/materialBake.ts
