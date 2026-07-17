import * as THREE from 'three'
const track = new THREE.QuaternionKeyframeTrack('.quaternion', [0, 1], [0, 0, 0, 1, 0, 1, 0, 0])
const clip = new THREE.AnimationClip('test', 1, [track])
THREE.AnimationUtils.makeClipAdditive(clip)
console.log(clip.tracks[0].values)
