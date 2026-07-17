import fs from 'fs'
let src = fs.readFileSync('src/asset-source/pap.ts', 'utf8')
src = src.replace(
  '  if (boneNamesOverride) {\n    boneNames = boneNamesOverride\n  } else if (boneNames) {\n    // If tracks reference indices outside the skeleton, or the skeleton has no standard\n    // FFXIV bones, it is a dummy skeleton. The tracks map to the external SKLB indices.\n    const isStandard = boneNames.some((name) => name.startsWith(\\\'j_\\\') || name.startsWith(\\\'n_\\\'))\n    const isOutOfBounds = trackToBone.some((index) => index >= boneNames!.length)\n    if (!isStandard || isOutOfBounds) boneNames = undefined\n  }',
  '  if (boneNames) {\n    // If tracks reference indices outside the skeleton, or the skeleton has no standard\n    // FFXIV bones, it is a dummy skeleton. The tracks map to the external SKLB indices.\n    const isStandard = boneNames.some((name) => name.startsWith(\\\'j_\\\') || name.startsWith(\\\'n_\\\'))\n    const isOutOfBounds = trackToBone.some((index) => index >= boneNames!.length)\n    if (!isStandard || isOutOfBounds) boneNames = undefined\n  }\n  if (!boneNames && boneNamesOverride) {\n    boneNames = boneNamesOverride\n  }'
)
fs.writeFileSync('src/asset-source/pap.ts', src)
