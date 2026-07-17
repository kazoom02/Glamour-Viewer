import * as THREE from 'three'
const track = new THREE.VectorKeyframeTrack('.scale', [0, 1], [1, 1, 1, 1.5, 1.5, 1.5])
const clip = new THREE.AnimationClip('test', 1, [track])
THREE.AnimationUtils.makeClipAdditive(clip)
console.log(clip.tracks[0].values)
