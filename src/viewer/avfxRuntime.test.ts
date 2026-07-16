import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import type { AvfxCurve, AvfxEmitterDefinition, AvfxParticleDefinition, DecodedAvfx } from '../asset-source/avfx'
import { createAvfxRuntime } from './avfxRuntime'

const constant = (value: number): AvfxCurve => ({
  preBehavior: 0,
  postBehavior: 0,
  randomType: 0,
  keys: [{ frame: 0, interpolation: 1, outHandle: 1, inHandle: 1, value }],
})

describe('AVFX runtime', () => {
  it('follows an emitter rule and expires authored particles', () => {
    const emitter: AvfxEmitterDefinition = {
      type: 0,
      childLimit: 30,
      life: 3,
      lifeRandom: 0,
      loopStart: 0,
      loopEnd: 0,
      createCount: constant(1),
      createInterval: constant(30),
      position: {},
      rotation: {},
      scale: {},
      color: {},
      particleRules: [{
        enabled: true,
        target: 0,
        createTime: 1,
        createCount: 1,
        probability: 100,
        startFrame: 0,
        positionInfluence: true,
        rotationInfluence: false,
        scaleInfluence: false,
      }],
      emitterRules: [],
      modelIndices: [],
      generateMethod: 0,
    }
    const particle: AvfxParticleDefinition = {
      type: 1,
      life: 2,
      lifeRandom: 0,
      loopStart: 0,
      loopEnd: 0,
      drawMode: 2,
      drawPriority: 0,
      depthTest: true,
      depthWrite: false,
      position: {},
      rotation: {},
      scale: {},
      rotationVelocity: {},
      color: {},
      uvSets: [],
      colorTextures: [],
      modelIndices: [],
      data: {},
    }
    const avfx: DecodedAvfx = {
      version: 0x20110913,
      framesPerSecond: 60,
      textures: [],
      timelines: [{ loopStart: 0, loopEnd: 0, binder: -1, items: [{ enabled: true, startFrame: 0, endFrame: 3, binder: -1, effector: -1, emitter: 0, clip: -1 }] }],
      emitters: [emitter],
      particles: [particle],
      models: [],
      rootEmitterIndices: [0],
      unsupportedParticleTypes: [],
    }
    const target = new THREE.Group()
    const runtime = createAvfxRuntime(target, avfx, [], 1)
    runtime.update(1 / 60)
    expect(runtime.renderedParticles).toBe(1)
    runtime.update(2 / 60)
    expect(runtime.renderedParticles).toBe(0)
    runtime.dispose()
    expect(target.children).toHaveLength(0)

    emitter.childLimit = 1
    emitter.life = 4
    emitter.createInterval = constant(1)
    particle.life = 10
    particle.type = 13
    particle.scale = { x: constant(0.25), y: constant(0.5), z: constant(10) }
    avfx.rootEmitterIndices = [0, 0]
    const limitedTarget = new THREE.Group()
    const limitedRuntime = createAvfxRuntime(limitedTarget, avfx, [], 1)
    limitedRuntime.update(1 / 60)
    limitedRuntime.update(1 / 60)
    limitedRuntime.update(1 / 60)
    expect(limitedRuntime.renderedParticles).toBe(1)
    const rendered = limitedTarget.getObjectByName('avfx-particle-0')
    expect(rendered?.scale.toArray()).toEqual([0.25, 0.25, 0.25])
    limitedRuntime.dispose()
  })
})
