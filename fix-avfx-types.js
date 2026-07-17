import fs from 'fs';
const file = 'src/viewer/avfxRuntime.ts';
let code = fs.readFileSync(file, 'utf8');

const cylinderAndSphere = `
function cylinderGeometry(definition: AvfxParticleDefinition): THREE.BufferGeometry {
  const segmentsValue = definition.data.PCnV
  const segments = Math.max(8, Math.min(64, typeof segmentsValue === 'number' ? Math.round(segmentsValue) : 16))
  const geometry = new THREE.CylinderGeometry(0.5, 0.5, 1, segments, 1, true)
  // geometry.rotateX(Math.PI / 2)
  return geometry
}

function sphereGeometry(definition: AvfxParticleDefinition): THREE.BufferGeometry {
  const segmentsValue = definition.data.PCnV
  const segments = Math.max(8, Math.min(64, typeof segmentsValue === 'number' ? Math.round(segmentsValue) : 16))
  return new THREE.SphereGeometry(0.5, segments, segments)
}

function createProceduralGeometry(definition: AvfxParticleDefinition): THREE.BufferGeometry {
  if (definition.type === 2) return cylinderGeometry(definition)
  if (definition.type === 3) return sphereGeometry(definition)
  if (definition.type === 12 || definition.type === 13) return discGeometry(definition)
  return spriteGeometry()
}
`;

code = code.replace('function spriteGeometry(): THREE.PlaneGeometry {', cylinderAndSphere + '\nfunction spriteGeometry(): THREE.PlaneGeometry {');

code = code.replace(
  `proceduralGeometry = ensureShaderAttributes(definition.type === 12 ? discGeometry(definition) : spriteGeometry())`,
  `proceduralGeometry = ensureShaderAttributes(createProceduralGeometry(definition))`
);

fs.writeFileSync(file, code);
