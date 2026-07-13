import { Color, Group, type Object3D, type Scene } from 'three'
import type { BossFight } from '../../sim/boss'
import { createRng } from '../../sim/rng'
import type { TitanState } from '../../sim/titan'
import type { Limb } from '../titans'
import { TitanPoser } from '../titans'
import type { BossBodyVisual } from './lib'
import { MatBag, PartFrame } from './lib'

/**
 * Female Titan, ported from blender/titans/female/build.py: Annie's athletic
 * two-tone body. Red exposed muscle everywhere except the pale skin panels the
 * build embeds over torso front/back, glutes, and face; red chain-link core
 * down the belly, blonde bob, blue eyes, red cheek fiber patches, pale ankle
 * wraps. Native H = 14 m equals the sim height, so the scale is 1 and every
 * part anchor (wrist 0.52, calf 0.18, nape 0.82) lands on anatomy directly.
 */

const NATIVE_H = 14.0

export function buildFemaleTitan(t: TitanState): BossBodyVisual {
  const mats = new MatBag()
  // MUSCLE_COLOR (0.5, 0.16, 0.11) with fiber striation: bark grain under a red tint
  const muscle = mats.make({
    map: '/textures/bark.jpg',
    tint: new Color(1.9, 0.62, 0.45), // tuned live: bark grain reads as fiber striation
    repeat: 3,
    roughness: 0.65,
  })
  // PALE_COLOR (0.62, 0.47, 0.38): the skin panels
  const pale = mats.make({
    map: '/textures/skin.jpg',
    tint: new Color(1.5, 1.32, 1.14),
    repeat: 2,
    roughness: 0.6,
    normal: '/textures/wall_nor.jpg',
    normalScale: 0.25,
  })
  // HAIR_COLOR (0.6, 0.55, 0.28): olive blonde bob (skin map: linen is blue)
  const hair = mats.make({ map: '/textures/skin.jpg', tint: new Color('#cdb44e').multiplyScalar(1.25), repeat: 2, roughness: 0.75 })
  // ChainRed (0.35, 0.1, 0.07): belly links and cheek patches
  const link = mats.make({ map: '/textures/bark.jpg', tint: new Color('#b03626').multiplyScalar(1.2), repeat: 2, roughness: 0.6 })
  const dark = mats.make({ map: '/textures/bark.jpg', tint: 0x2a1713, roughness: 0.6 })
  // Eye (0.25, 0.45, 0.75): blue, faint glow
  const eye = mats.make({
    map: '/textures/skin.jpg',
    tint: 0x4a7fd0,
    roughness: 0.25,
    emissive: 0x2d5db3,
    emissiveIntensity: 0.6,
  })

  const group = new Group()
  group.scale.setScalar(t.height / NATIVE_H)

  // torso: tight waist, wider hips, pale front/back panels over the red core
  const torso = PartFrame.at(group, 0, 0, 7.9)
  torso.ball(muscle, 0, 0.1, 12.35, 0.5)
  torso.ball(muscle, 0, 0.15, 12.1, 0.6)
  for (const s of [1, -1]) {
    torso.ball(muscle, s * 0.7, 0.15, 12.05, 0.65)
    torso.ball(muscle, s * 1.05, 0.12, 11.85, 0.55)
    torso.ball(muscle, s * 0.6, 0.0, 11.15, 0.8)
    torso.ball(muscle, s * 0.9, 0.3, 10.6, 0.7)
    torso.ball(muscle, s * 0.62, 0.0, 7.6, 0.85)
    torso.ball(muscle, s * 1.45, 0.1, 11.7, 0.72)
  }
  torso.ball(muscle, 0, 0.1, 11.2, 1.25)
  torso.ball(muscle, 0, 0.4, 11.3, 0.95)
  torso.ball(muscle, 0, -0.05, 10.0, 0.95)
  torso.ball(muscle, 0, -0.05, 9.4, 0.85)
  torso.ball(muscle, 0, 0.0, 8.9, 0.85)
  torso.ball(muscle, 0, 0.0, 7.9, 1.1)
  torso.ball(muscle, 0, 0.35, 7.8, 0.8)
  // pale panels: chest plate, belly column, pelvis triangle, glutes, upper back
  torso.ball(pale, 0, -0.55, 11.35, 0.9)
  for (const s of [1, -1]) {
    torso.ball(pale, s * 0.55, -0.5, 11.1, 0.7)
    torso.ball(pale, s * 0.45, 0.55, 7.75, 0.6)
  }
  torso.ball(pale, 0, -0.5, 10.7, 0.65)
  torso.ball(pale, 0, -0.55, 10.1, 0.56)
  torso.ball(pale, 0, -0.58, 9.65, 0.56)
  torso.ball(pale, 0, -0.55, 9.2, 0.56)
  torso.ball(pale, 0, -0.52, 8.8, 0.52)
  torso.ball(pale, 0, -0.45, 7.85, 0.7)
  torso.ball(pale, 0, -0.5, 8.4, 0.5)
  torso.ball(pale, 0, 0.65, 11.3, 0.75)
  torso.ball(pale, 0, 0.6, 10.4, 0.6)
  // red chain-link core down the pale belly panel
  const bellyFront = -1.0
  for (let i = 0; i < 4; i++) {
    torso.box(link, 0, bellyFront + 0.01, 10.25 - i * 0.4, [0.34, 0.18, 0.28])
  }

  // head: pale face over the red skull, bob, blue eyes, cheek fiber patches
  const head = torso.child(0, 0.1, 12.35)
  head.ball(muscle, 0, 0.05, 13.0, 0.62)
  head.ball(muscle, 0, 0.12, 13.3, 0.55)
  head.ball(muscle, 0, -0.12, 12.7, 0.38)
  head.ball(pale, 0, -0.32, 13.0, 0.44)
  head.ball(pale, 0, -0.28, 12.73, 0.36)
  const eyeFront = -0.72
  for (const s of [1, -1]) {
    head.ball(dark, s * 0.2, eyeFront + 0.08, 13.05, 0.08, { scale: [1.1, 0.35, 0.9] })
    head.ball(eye, s * 0.2, eyeFront + 0.05, 13.05, 0.038)
    head.ball(link, s * 0.27, eyeFront + 0.14, 12.83, 0.1, { scale: [0.85, 0.15, 1.25] })
  }
  head.box(dark, 0, -0.6, 12.65, [0.3, 0.06, 0.05])
  head.ball(pale, 0, -0.63, 12.85, 0.06, { scale: [0.55, 0.5, 0.8] })
  // blonde bob: crown, back, side curtains over the ears, side-swept fringe
  head.ball(hair, 0, 0.15, 13.4, 0.58, { scale: [1.1, 1.15, 0.7] })
  head.ball(hair, 0, 0.42, 12.8, 0.42, { scale: [1.2, 0.7, 1.4] })
  head.ball(hair, 0, -0.4, 13.32, 0.32, { scale: [1.4, 0.4, 0.35] })
  for (const s of [1, -1]) head.ball(hair, s * 0.46, 0.05, 12.8, 0.26, { scale: [0.35, 0.75, 1.3] })
  const wisp = createRng(t.id * 7919 + 61)
  for (let i = 0; i < 7; i++) {
    const s = i % 2 ? 1 : -1
    head.ball(hair, s * (0.3 + wisp() * 0.25), 0.15 + wisp() * 0.3, 12.75 + wisp() * 0.5, 0.1 + wisp() * 0.06, {
      scale: [0.5, 0.9, 1.6 + wisp()],
      rot: [wisp() * 0.4, 0, s * 0.3],
    })
  }

  // arms: long and lean red muscle; the plated wrist is the first lit part
  const arm = (s: number): Limb & { wrist: PartFrame } => {
    const pivot = torso.child(s * 1.6, 0.1, 11.6)
    pivot.chain(muscle, s * 1.6, 0.1, 11.6, s * 1.85, -0.1, 9.4, 0.55, 0.45)
    pivot.ball(muscle, s * 1.7, -0.2, 10.6, 0.48)
    const wrist = pivot.child(s * 1.85, -0.1, 9.4)
    wrist.chain(muscle, s * 1.85, -0.1, 9.4, s * 1.95, -0.35, 6.95, 0.47, 0.36)
    wrist.ball(muscle, s * 1.95, -0.45, 6.6, 0.4)
    wrist.ball(muscle, s * 1.95, -0.55, 6.25, 0.3)
    return { pivot: pivot.node, lower: wrist.node, wrist }
  }
  const armL = arm(1)
  const armR = arm(-1)

  // legs: long, red muscle, pale ankle wraps
  const leg = (s: number): Limb & { knee: PartFrame } => {
    const pivot = PartFrame.at(group, s * 0.72, 0, 7.3)
    pivot.chain(muscle, s * 0.72, 0.0, 7.3, s * 0.8, -0.12, 4.1, 0.85, 0.6)
    pivot.ball(muscle, s * 0.78, -0.35, 5.9, 0.6)
    pivot.ball(muscle, s * 0.72, -0.3, 5.2, 0.5)
    pivot.ball(muscle, s * 0.75, 0.35, 5.9, 0.55)
    const knee = pivot.child(s * 0.8, -0.02, 4.1)
    knee.chain(muscle, s * 0.8, -0.02, 4.1, s * 0.74, 0.08, 0.75, 0.62, 0.4)
    knee.ball(muscle, s * 0.78, 0.35, 3.2, 0.45)
    knee.ball(muscle, s * 0.75, 0.28, 2.6, 0.38)
    knee.ball(muscle, s * 0.72, -0.25, 0.55, 0.45)
    knee.ball(muscle, s * 0.72, -0.7, 0.45, 0.4)
    knee.ball(muscle, s * 0.72, -1.15, 0.38, 0.34)
    knee.ball(muscle, s * 0.72, 0.12, 0.5, 0.38)
    knee.ball(muscle, s * 0.52, -1.42, 0.28, 0.16)
    knee.ball(muscle, s * 0.72, -1.47, 0.29, 0.17)
    knee.ball(muscle, s * 0.92, -1.42, 0.28, 0.16)
    knee.ball(pale, s * 0.74, 0.0, 0.75, 0.36, { scale: [1.15, 1.15, 0.45] })
    return { pivot: pivot.node, lower: knee.node, knee }
  }
  const legL = leg(1)
  const legR = leg(-1)

  // Weak Points: lat +0.22 is the LEFT (hardened) wrist, lat -0.12 the RIGHT calf
  const anchors: Record<string, Object3D> = {
    wrist: armL.wrist.anchor(1.95, -0.45, 7.0),
    calf: legR.knee.anchor(-0.78, 0.4, 2.6),
    nape: torso.anchor(0, 0.55, 11.6),
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
      poser.syncPose(fight.titan, dt)
    },
    partAnchor(partId: string) {
      return anchors[partId] ?? null
    },
  }
}
