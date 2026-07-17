import * as THREE from 'three'
const obj = new THREE.Object3D()
obj.position.set(0, 1, 0)
const track = new THREE.VectorKeyframeTrack('.position', [0], [0, 1, 0])
const clip = new THREE.AnimationClip('test', 1, [track])
const mixer = new THREE.AnimationMixer(obj)
const action = mixer.clipAction(clip)
action.blendMode = THREE.AdditiveAnimationBlendMode
action.play()
mixer.update(0)
console.log('Position after additive:', obj.position.toArray())
