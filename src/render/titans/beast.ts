import { Color, Group, type Object3D, type Scene } from 'three'
import type { BossFight } from '../../sim/boss'
import { THROW_WINDUP_SECONDS } from '../../sim/boss'
import { createRng } from '../../sim/rng'
import type { TitanState } from '../../sim/titan'
import type { Limb } from '../titans'
import { TitanPoser } from '../titans'
import type { BossBodyVisual } from './lib'
import { MatBag, PartFrame } from './lib'

/**
 * Beast Titan, ported from blender/build.py (the original 330-line build the
 * whole titan loop grew from). Two families: dark FUR (mane, traps, torso,
 * pelvis, limbs, beard) and tan SKIN (face, chest, belly, hands, feet) that
 * overlap to fake the fur boundary. The 6000-strand particle fur becomes a
 * rough dark coat plus seeded tufts clustered where the strand weights ran
 * long (mane, shoulders, beard). Native H = 17 m equals the sim height.
 *
 * Boss overlay: the throw windup rears the throwing arm back while the sim's
 * fight.state.windup ticks toward the boulder release.
 */

const NATIVE_H = 17.0

export function buildBeastTitan(t: TitanState): BossBodyVisual {
  const mats = new MatBag()
  // fur reads as the STRAND pass (0.16, 0.09, 0.055) since that is what the
  // renders show; the near-black undercoat only peeks through the bark grain
  const fur = mats.make({ map: '/textures/bark.jpg', tint: new Color('#6b4529').multiplyScalar(1.2), repeat: 3, roughness: 0.95 })
  const strand = mats.make({ map: '/textures/bark.jpg', tint: new Color('#8a5c36').multiplyScalar(1.2), repeat: 2, roughness: 0.9 })
  // SKIN_COLOR (0.44, 0.29, 0.19): tan face/chest/hands
  const skin = mats.make({
    map: '/textures/skin.jpg',
    tint: new Color('#cf9058').multiplyScalar(1.2),
    repeat: 2,
    roughness: 0.65,
    normal: '/textures/wall_nor.jpg',
    normalScale: 0.3,
  })
  const dark = mats.make({ map: '/textures/bark.jpg', tint: 0x120a07, roughness: 0.55 })
  const eye = mats.make({ map: '/textures/bark.jpg', tint: 0x0a0605, roughness: 0.2 })

  const group = new Group()
  group.scale.setScalar(t.height / NATIVE_H)

  // torso: furred barrel with the tan chest/belly panel embedded in front
  const torso = PartFrame.at(group, 0, 0.2, 7.9)
  torso.ball(fur, 0, 0.5, 12.6, 2.2)
  torso.ball(fur, 0, 0.6, 11.0, 2.3)
  torso.ball(fur, 0, 0.4, 9.4, 2.1)
  torso.ball(fur, 0, 1.5, 12.2, 1.9)
  torso.ball(fur, 0, 0.2, 7.9, 1.9)
  torso.ball(fur, 0, 0.6, 14.1, 1.9)
  torso.ball(fur, 0, 0.1, 14.6, 1.15)
  for (const s of [1, -1]) {
    torso.ball(fur, s * 1.0, 0.1, 7.5, 1.5)
    torso.ball(fur, s * 1.8, 0.3, 13.4, 1.9)
    torso.ball(fur, s * 1.3, 0.0, 14.1, 1.45)
    torso.ball(fur, s * 2.9, 0.0, 12.8, 1.7)
    torso.ball(fur, s * 2.3, 0.1, 13.3, 1.5)
    torso.ball(skin, s * 0.85, -1.15, 12.0, 1.05)
  }
  torso.ball(skin, 0, -1.2, 11.85, 0.9)
  torso.ball(skin, 0, -1.3, 10.9, 1.25)
  torso.ball(skin, 0, -1.1, 9.9, 1.95)
  // mane tufts: seeded clusters where the strand weights ran long
  const tuft = createRng(t.id * 7919 + 89)
  for (let i = 0; i < 14; i++) {
    const s = i % 2 ? 1 : -1
    torso.ball(strand, s * tuft() * 2.6, 0.6 + tuft() * 1.2, 12.4 + tuft() * 2.2, 0.35 + tuft() * 0.3, {
      scale: [0.6, 0.5, 1.6 + tuft() * 1.2],
      rot: [-0.4 - tuft() * 0.5, 0, s * (tuft() - 0.5)],
      segments: 8,
    })
  }

  // head: tan simian face out of the fur ruff; the beard wraps the jaw
  const head = torso.child(0, -0.2, 14.9)
  head.ball(skin, 0, -0.3, 15.0, 0.7)
  head.ball(skin, 0, -0.45, 15.2, 0.7)
  head.ball(skin, 0, -0.35, 15.75, 1.05)
  head.ball(skin, 0, -0.1, 16.05, 0.75)
  head.ball(skin, 0, -1.05, 15.5, 0.42)
  head.ball(fur, 0, 0.25, 16.25, 0.7)
  head.ball(fur, 0, 0.6, 15.85, 0.65)
  head.ball(fur, 0, -1.0, 14.75, 0.55)
  head.ball(fur, 0, -0.9, 14.25, 0.45)
  for (const s of [1, -1]) {
    head.ball(skin, s * 0.42, -0.65, 15.35, 0.34)
    head.ball(skin, s * 0.3, -0.9, 15.98, 0.22)
    head.ball(skin, s * 0.72, -0.2, 15.95, 0.22)
    head.ball(fur, s * 0.45, -0.8, 14.95, 0.38)
    // deep-set near-black eyes and nostrils against the raw sphere fronts
    head.ball(dark, s * 0.27, -1.32, 15.8, 0.085)
    head.ball(eye, s * 0.27, -1.39, 15.8, 0.035)
    head.ball(dark, s * 0.1, -1.44, 15.5, 0.04)
  }
  // beard tufts trailing off the chin
  for (let i = 0; i < 6; i++) {
    const s = i % 2 ? 1 : -1
    head.ball(strand, s * tuft() * 0.5, -1.05 - tuft() * 0.25, 14.4 + tuft() * 0.7, 0.16 + tuft() * 0.12, {
      scale: [0.7, 0.6, 1.8],
      rot: [0.5 + tuft() * 0.4, 0, s * 0.2],
      segments: 8,
    })
  }

  // arms: long furred slabs down to huge tan hands with eight fingers
  const arm = (s: number): Limb & { wrist: PartFrame } => {
    const pivot = torso.child(s * 3.15, 0, 12.5)
    pivot.chain(fur, s * 3.15, 0.0, 12.5, s * 3.35, -0.1, 8.8, 1.45, 1.15)
    const wrist = pivot.child(s * 3.35, -0.1, 8.8)
    wrist.chain(fur, s * 3.35, -0.1, 8.8, s * 3.35, -0.45, 4.0, 1.15, 0.95)
    wrist.ball(skin, s * 3.4, -0.55, 3.5, 1.35)
    wrist.ball(skin, s * 3.45, -0.8, 2.7, 1.05)
    wrist.ball(skin, s * 3.45, -1.0, 2.1, 0.75)
    wrist.ball(skin, s * 3.15, -0.9, 2.2, 0.2)
    wrist.ball(skin, s * 3.4, -0.95, 2.15, 0.21)
    wrist.ball(skin, s * 3.65, -0.95, 2.15, 0.21)
    wrist.ball(skin, s * 3.9, -0.9, 2.2, 0.2)
    wrist.ball(skin, s * 3.15, -1.0, 1.75, 0.15)
    wrist.ball(skin, s * 3.4, -1.05, 1.7, 0.16)
    wrist.ball(skin, s * 3.65, -1.05, 1.7, 0.16)
    wrist.ball(skin, s * 3.9, -1.0, 1.75, 0.15)
    return { pivot: pivot.node, lower: wrist.node, wrist }
  }
  const armL = arm(1)
  const armR = arm(-1)

  // legs: short relative to the arms (the simian stance), tan feet
  const leg = (s: number): Limb & { knee: PartFrame } => {
    const hip = PartFrame.at(group, s * 1.35, 0, 7.3)
    hip.chain(fur, s * 1.35, 0.0, 7.3, s * 1.4, -0.15, 4.3, 1.55, 1.15)
    const knee = hip.child(s * 1.4, -0.15, 4.3)
    knee.chain(fur, s * 1.4, -0.15, 4.3, s * 1.35, 0.05, 1.1, 1.15, 0.75)
    knee.ball(skin, s * 1.35, -0.5, 0.7, 0.9)
    knee.ball(skin, s * 1.4, -1.25, 0.62, 0.8)
    knee.ball(skin, s * 1.5, -2.0, 0.55, 0.68)
    knee.ball(skin, s * 1.15, -2.35, 0.45, 0.2)
    knee.ball(skin, s * 1.45, -2.4, 0.48, 0.22)
    knee.ball(skin, s * 1.75, -2.35, 0.45, 0.2)
    return { pivot: hip.node, lower: knee.node, knee }
  }
  const legL = leg(1)
  const legR = leg(-1)

  // Weak Points: LEFT ankle, the RIGHT Throwing Wrist (sim holds it at 0.52h,
  // the upper forearm), nape under the mane
  const anchors: Record<string, Object3D> = {
    ankle: legL.knee.anchor(1.4, -0.6, 0.9),
    wrist: armR.wrist.anchor(-3.35, -0.55, 8.4),
    nape: torso.anchor(0, 1.0, 14.0),
  }

  const poser = new TitanPoser({
    group,
    torso: torso.node,
    head: head.node,
    legL,
    legR,
    armL,
    armR,
    setFade: (fade) => mats.setFade(fade),
  })
  poser.syncPose(t, 0)

  return {
    addTo(scene: Scene) {
      scene.add(group)
    },
    removeFrom(scene: Scene) {
      scene.remove(group)
    },
    sync(fight: BossFight, dt: number) {
      const titan = fight.titan
      poser.syncPose(titan, dt)
      // throw windup: the throwing arm rears back as the release approaches
      const windup = fight.state.windup
      if (windup !== null && (titan.state === 'wander' || titan.state === 'chase')) {
        const w = 1 - Math.max(0, windup) / THROW_WINDUP_SECONDS
        armR.pivot.rotation.x = 2.2 * w
        armR.lower.rotation.x = -0.6 * w
        torso.node.rotation.x -= 0.12 * w
      }
    },
    partAnchor(partId: string) {
      return anchors[partId] ?? null
    },
  }
}
