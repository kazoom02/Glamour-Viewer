import { decodePap, type DecodedAnimation } from './pap'
import { decodeSklb, type DecodedSkeleton } from './sklb'

export const MATERIAL_ANIMATION_SKELETON_PATH = 'chara/common/animation/skl_material.sklb'

export interface DecodedMaterialAnimationTrack {
  name: string
  boneIndex: number
  colors: Float32Array
}

export interface DecodedMaterialAnimation {
  name: string
  path: string
  duration: number
  times: Float32Array
  tracks: DecodedMaterialAnimationTrack[]
}

/** Converts material-skeleton translations into the RGB curves used by the game. */
export function materialAnimationFromDecoded(
  animation: DecodedAnimation,
  skeleton: DecodedSkeleton,
): DecodedMaterialAnimation {
  const tracks = animation.tracks.flatMap((track): DecodedMaterialAnimationTrack[] => {
    const bone = skeleton.bones[track.boneIndex]
    if (!bone || bone.name.toLowerCase() === 'n_material') return []
    return [{
      name: bone.name,
      boneIndex: track.boneIndex,
      colors: track.translations,
    }]
  })
  if (!tracks.length) throw new Error('The material PAP has no animated material-color tracks.')
  return {
    name: animation.name,
    path: animation.path,
    duration: animation.duration,
    times: animation.times,
    tracks,
  }
}

export function decodeMaterialAnimation(
  papBytes: ArrayBuffer,
  skeletonBytes: ArrayBuffer,
  path: string,
): DecodedMaterialAnimation {
  return materialAnimationFromDecoded(decodePap(papBytes, path, 30), decodeSklb(skeletonBytes))
}

function namedTrackIndex(name: string): number | undefined {
  const suffix = name.toLowerCase().replace(/^n_material_?/, '')
  if (/^\d+$/.test(suffix)) return Math.max(0, Number(suffix) - 1)
  if (/^[a-z]$/.test(suffix)) return suffix.charCodeAt(0) - 97
  return undefined
}

/** Selects the material slot while retaining deterministic track order as fallback. */
export function materialAnimationTrack(
  animation: DecodedMaterialAnimation,
  materialIndex: number,
): DecodedMaterialAnimationTrack | undefined {
  return animation.tracks.find((track) => namedTrackIndex(track.name) === materialIndex)
    ?? animation.tracks[materialIndex]
    ?? animation.tracks[materialIndex % animation.tracks.length]
}

/** Samples one authored RGB curve with linear interpolation and loop wrapping. */
export function sampleMaterialAnimationTrack(
  animation: DecodedMaterialAnimation,
  track: DecodedMaterialAnimationTrack,
  elapsed: number,
  target: [number, number, number] = [0, 0, 0],
): [number, number, number] {
  const frameCount = Math.min(animation.times.length, Math.floor(track.colors.length / 3))
  if (!frameCount) return target
  const duration = animation.duration > 0 ? animation.duration : animation.times[frameCount - 1] ?? 0
  const time = duration > 0 ? ((elapsed % duration) + duration) % duration : 0
  let high = 1
  while (high < frameCount && animation.times[high]! < time) high += 1
  if (high >= frameCount) high = frameCount - 1
  const low = Math.max(0, high - 1)
  const lowTime = animation.times[low] ?? 0
  const highTime = animation.times[high] ?? lowTime
  const factor = highTime > lowTime ? (time - lowTime) / (highTime - lowTime) : 0
  for (let component = 0; component < 3; component += 1) {
    const start = track.colors[low * 3 + component] ?? 0
    const end = track.colors[high * 3 + component] ?? start
    target[component] = start + (end - start) * factor
  }
  return target
}
