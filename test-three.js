const THREE = require('three')

const track1 = new THREE.NumberKeyframeTrack('bone1.position', [0, 1], [0, 1])
const clip = new THREE.AnimationClip('test', 1, [track1]).optimize()

console.log('Before:', clip.tracks.map(t => t.name))
const track2 = new THREE.NumberKeyframeTrack('bone2.position', [0, 1], [0, 1])
clip.tracks.push(track2)
clip.resetDuration()

console.log('After:', clip.tracks.map(t => t.name))

const mixer = new THREE.AnimationMixer(new THREE.Object3D())
const action = mixer.clipAction(clip)
// The action creates PropertyMixers. Let's see how many property bindings it creates.
console.log('Bindings:', action._propertyBindings ? action._propertyBindings.length : 'unknown')
