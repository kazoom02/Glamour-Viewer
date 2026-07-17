sed -i 's/const opacity = textures.normal && textures.normal.format !== TEX_FORMAT.BC5/const opacity = 1 \/\/ textures.normal \&\& textures.normal.format !== TEX_FORMAT.BC5/g' src/asset-source/materialBake.ts
sed -i 's/? sample(textures.normal, x, y, width, height)\[2\] \/ 255/\/\/ ? sample(textures.normal, x, y, width, height)\[2\] \/ 255/g' src/asset-source/materialBake.ts
sed -i 's/: 1/\/\/ : 1/g' src/asset-source/materialBake.ts
