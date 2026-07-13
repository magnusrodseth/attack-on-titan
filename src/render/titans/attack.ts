import { Color, Group, type Object3D, type Scene } from 'three'
import type { BossFight } from '../../sim/boss'
import { createRng } from '../../sim/rng'
import type { TitanState } from '../../sim/titan'
import type { Limb } from '../titans'
import { TitanPoser } from '../titans'
import type { BossBodyVisual } from './lib'
import { MatBag, PartFrame } from './lib'

/**
 * Attack Titan, ported from blender/titans/attack/build.py: Eren's athletic
 * skinless-muscle humanoid. Tan/terracotta fiber muscle everywhere, V-taper
 * torso, the permanent skull grin (a teeth band following the face curve),
 * strong brow ridge, pointed ears, long black hair. Native H = 15 m equals
 * the sim height; anchors (hamstring, forearm, shoulder, nape) sit on anatomy.
 */

const NATIVE_H = 15.0

export function buildAttackTitan(t: TitanState): BossBodyVisual {
  const mats = new MatBag()
  // MUSCLE_COLOR tan/terracotta: the flesh map's mottling reads as flayed muscle
  // under a tan tint, with plank-grain normals for the fiber relief
  const muscle = mats.make({
    map: '/textures/skin.jpg',
    tint: new Color('#f0ae6c').multiplyScalar(1.25),
    repeat: 2,
    roughness: 0.7,
    normal: '/textures/planks_nor.jpg',
    normalScale: 0.6,
  })
  // HAIR_COLOR (0.03, 0.025, 0.02): near-black shag
  const hair = mats.make({ map: '/textures/bark.jpg', tint: 0x17100c, repeat: 2, roughness: 0.8 })
  const dark = mats.make({ map: '/textures/bark.jpg', tint: 0x24140e, roughness: 0.6 })
  // Tooth (0.92, 0.9, 0.85): the grin band
  const tooth = mats.make({ map: '/textures/plaster.jpg', tint: new Color(1.5, 1.45, 1.35), roughness: 0.35 })
  // manic bloodshot stare (PD photo, README credits), feathered into the sockets
  const eye = mats.decal('/textures/eye-bloodshot.jpg', { feather: true })

  const group = new Group()
  group.scale.setScalar(t.height / NATIVE_H)

  // torso: V-taper — broad traps/chest, tight waist, solid pelvis
  const torso = PartFrame.at(group, 0, 0, 8.3)
  torso.ball(muscle, 0, 0.15, 13.0, 0.75)
  torso.ball(muscle, 0, 0.2, 12.75, 0.85)
  for (const s of [1, -1]) {
    torso.ball(muscle, s * 0.8, 0.2, 12.95, 1.05)
    torso.ball(muscle, s * 0.7, -0.35, 12.25, 0.85)
    torso.ball(muscle, s * 0.9, 0.1, 11.9, 1.0)
    torso.ball(muscle, s * 1.15, 0.4, 11.3, 1.0)
    torso.ball(muscle, s * 0.65, 0.0, 7.9, 1.0)
    torso.ball(muscle, s * 1.85, 0.1, 12.35, 1.0)
  }
  torso.ball(muscle, 0, 0.1, 11.9, 1.8)
  torso.ball(muscle, 0, 0.55, 12.0, 1.3)
  torso.ball(muscle, 0, -0.05, 10.7, 1.3)
  torso.ball(muscle, 0, -0.1, 9.9, 1.2)
  torso.ball(muscle, 0, 0.0, 9.3, 1.05)
  torso.ball(muscle, 0, 0.05, 8.3, 1.45)
  torso.ball(muscle, 0, 0.4, 8.1, 0.95)

  // head: skull grin, deep-set green eyes, brow ridge, pointed ears, black mane
  const head = torso.child(0, 0.15, 13.0)
  head.ball(muscle, 0, 0.05, 13.95, 0.72, { scale: [0.88, 1, 1] }) // slimmed: metaballs blend narrower
  head.ball(muscle, 0, 0.15, 14.3, 0.62, { scale: [0.88, 1, 1] })
  head.ball(muscle, 0, -0.15, 13.4, 0.42)
  head.ball(muscle, 0, -0.05, 13.2, 0.4)
  // face features sit ON the skull-ball surface (build.py probes the metaball
  // surface; here the sphere front at each z is computed from the ball itself)
  for (const s of [1, -1]) {
    head.ball(muscle, s * 0.38, -0.08, 13.65, 0.16)
    head.ball(dark, s * 0.24, -0.6, 14.0, 0.24, { scale: [1.1, 0.4, 0.9] })
    head.plane(eye, s * 0.24, -0.72, 14.0, 0.85, 0.68)
    head.ball(muscle, s * 0.62, -0.05, 13.85, 0.16, { scale: [0.3, 0.5, 1.0], rot: [0.35, s * 0.5, 0] })
  }
  head.ball(muscle, 0, -0.5, 14.23, 0.3, { scale: [1.5, 0.5, 0.35] })
  head.ball(muscle, 0, -0.57, 13.8, 0.09, { scale: [0.6, 0.5, 0.7] })
  // the ear-to-ear grin: 10 teeth arcing back toward the cheeks with dark gaps,
  // deep boxes so the band stays proud of the blended jaw surface
  for (let i = 0; i < 10; i++) {
    const tx = -0.62 + i * 0.138
    const surf = -0.66 + (Math.abs(tx) / 0.62) ** 2 * 0.32
    head.box(tooth, tx, surf + 0.06, 13.4, [0.125, 0.28, 0.3])
    if (i < 9) head.box(dark, tx + 0.069, surf + 0.12, 13.4, [0.03, 0.28, 0.31])
  }
  // long black hair: crown cap, back flap, shoulder-length side curtains + tufts
  head.ball(hair, 0, 0.2, 14.55, 0.68, { scale: [1.08, 1.12, 0.72] })
  head.ball(hair, 0, 0.6, 13.4, 0.5, { scale: [1.15, 0.6, 2.3] })
  for (const s of [1, -1]) head.ball(hair, s * 0.45, 0.25, 13.4, 0.3, { scale: [0.45, 0.75, 2.2] })
  const shag = createRng(t.id * 7919 + 73)
  for (let i = 0; i < 8; i++) {
    const s = i % 2 ? 1 : -1
    head.ball(hair, s * (0.2 + shag() * 0.35), 0.3 + shag() * 0.35, 13.1 + shag() * 0.9, 0.12 + shag() * 0.08, {
      scale: [0.55, 0.8, 1.8 + shag() * 1.2],
      rot: [shag() * 0.5, 0, s * (0.2 + shag() * 0.3)],
    })
  }

  // arms: long, fingertips at mid-thigh; the counter-swat comes from the poser
  const arm = (s: number): Limb & { wrist: PartFrame } => {
    const pivot = torso.child(s * 2.0, 0.1, 12.3)
    pivot.chain(muscle, s * 2.0, 0.1, 12.3, s * 2.3, -0.15, 9.9, 0.85, 0.68)
    pivot.ball(muscle, s * 2.2, -0.3, 11.2, 0.7)
    pivot.ball(muscle, s * 2.25, 0.25, 11.1, 0.55)
    const wrist = pivot.child(s * 2.3, -0.15, 9.9)
    wrist.chain(muscle, s * 2.3, -0.15, 9.9, s * 2.45, -0.4, 7.3, 0.72, 0.58)
    wrist.ball(muscle, s * 2.4, -0.3, 9.2, 0.62)
    wrist.ball(muscle, s * 2.45, -0.5, 6.9, 0.55)
    wrist.ball(muscle, s * 2.45, -0.65, 6.45, 0.45)
    wrist.ball(muscle, s * 2.25, -0.62, 6.2, 0.18)
    wrist.ball(muscle, s * 2.45, -0.68, 6.15, 0.19)
    wrist.ball(muscle, s * 2.65, -0.62, 6.2, 0.18)
    return { pivot: pivot.node, lower: wrist.node, wrist }
  }
  const armL = arm(1)
  const armR = arm(-1)

  // legs: long with bulging quads and calves, bare feet with toes
  const leg = (s: number): Limb & { hip: PartFrame } => {
    const hip = PartFrame.at(group, s * 0.85, 0, 7.7)
    hip.chain(muscle, s * 0.85, 0.0, 7.7, s * 0.95, -0.15, 4.4, 1.1, 0.75)
    hip.ball(muscle, s * 0.95, -0.45, 6.4, 0.85)
    hip.ball(muscle, s * 0.85, -0.4, 5.6, 0.7)
    hip.ball(muscle, s * 0.9, 0.4, 6.4, 0.75)
    const knee = hip.child(s * 0.95, -0.05, 4.4)
    knee.chain(muscle, s * 0.95, -0.05, 4.4, s * 0.85, 0.1, 1.1, 0.8, 0.5)
    knee.ball(muscle, s * 0.95, 0.4, 3.6, 0.65)
    knee.ball(muscle, s * 0.9, 0.32, 2.9, 0.55)
    knee.ball(muscle, s * 0.85, -0.3, 0.55, 0.6)
    knee.ball(muscle, s * 0.85, -0.85, 0.5, 0.55)
    knee.ball(muscle, s * 0.85, -1.4, 0.45, 0.48)
    knee.ball(muscle, s * 0.85, 0.15, 0.55, 0.48)
    knee.ball(muscle, s * 0.6, -1.68, 0.35, 0.2)
    knee.ball(muscle, s * 0.85, -1.72, 0.36, 0.21)
    knee.ball(muscle, s * 1.1, -1.68, 0.35, 0.2)
    return { pivot: hip.node, lower: knee.node, hip }
  }
  const legL = leg(1)
  const legR = leg(-1)

  // Weak Points: hamstring lat +0.12 LEFT thigh-back; forearm lat -0.22 RIGHT;
  // shoulder lat +0.2 LEFT (sim holds it at 0.72h, on the lat below the deltoid)
  const anchors: Record<string, Object3D> = {
    hamstring: legL.hip.anchor(0.95, 0.5, 4.6),
    forearm: armR.wrist.anchor(-2.45, -0.55, 7.5),
    shoulder: torso.anchor(1.7, 0.3, 11.4),
    nape: torso.anchor(0, 0.6, 12.5),
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
