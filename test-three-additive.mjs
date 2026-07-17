import * as THREE from 'three'
const obj = new THREE.Object3D()
obj.scale.set(1, 1, 1)
const track = new THREE.VectorKeyframeTrack('.scale', [0], [1, 1, 1])
const clip = new THREE.AnimationClip('test', 1, [track])
const mixer = new THREE.AnimationMixer(obj)
const action = mixer.clipAction(clip)
action.blendMode = THREE.AdditiveAnimationBlendMode
action.play()
mixer.update(0)
console.log('Scale after additive 1:', obj.scale.toArray())
