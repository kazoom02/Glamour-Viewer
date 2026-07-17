import fs from 'fs';
const file = 'src/viewer/avfxRuntime.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
`  const geometry = new THREE.CylinderGeometry(0.5, 0.5, 1, segments, 1, true)
  // geometry.rotateX(Math.PI / 2)
  return geometry`,
`  const geometry = new THREE.CylinderGeometry(0.5, 0.5, 1, segments, 1, true)
  geometry.rotateX(Math.PI / 2)
  return geometry`
);

fs.writeFileSync(file, code);
