const THREE = require('three')

const track1 = new THREE.NumberKeyframeTrack('bone1.position', [0, 1], [0, 1])
const clip = new THREE.AnimationClip('test', 1, [track1]).optimize()

const track2 = new THREE.NumberKeyframeTrack('bone2.position', [0, 1], [0, 1])
clip.tracks.push(track2)
// clip.resetDuration() // Don't call it

const mixer = new THREE.AnimationMixer(new THREE.Object3D())
const action = mixer.clipAction(clip)
console.log('Bindings created:', action._propertyBindings ? action._propertyBindings.length : 'unknown')
