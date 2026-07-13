import { Color, Group, type Object3D, type Scene } from 'three'
import type { BossFight } from '../../sim/boss'
import { createRng } from '../../sim/rng'
import type { TitanState } from '../../sim/titan'
import type { Limb } from '../titans'
import { TitanPoser } from '../titans'
import type { BossBodyVisual } from './lib'
import { MatBag, PartFrame } from './lib'

/**
 * Jaw Titan, ported from blender/titans/jaw/build.py: the smallest of the Nine.
 * Lean pale-skinned biped with the white bone muzzle mask and jagged teeth arc,
 * the huge back-swept blonde mane, bone claws on hands and feet, and red exposed-
 * muscle patches at wrists and ankles. Numbers are the build.py values (native
 * H = 5 m), mirrored explicitly; the sim's 9 m height scales the whole body 1.8x,
 * which puts every part anchor (ankle 0.06, jaw 0.88, nape 0.82) on anatomy.
 */

const NATIVE_H = 5.0

export function buildJawTitan(t: TitanState): BossBodyVisual {
  const mats = new MatBag()
  // SKIN_COLOR (0.55, 0.38, 0.28): pale tan, smooth skin (no fiber striation)
  // tints tuned live against renders/front.png (raw linear values; skin.jpg runs
  // saturated tan, so pale needs a lifted near-white)
  const skin = mats.make({
    map: '/textures/skin.jpg',
    tint: new Color(1.6, 1.45, 1.3),
    repeat: 2,
    roughness: 0.65,
    normal: '/textures/wall_nor.jpg',
    normalScale: 0.3,
  })
  // BONE_COLOR (0.85, 0.82, 0.75): mask, teeth, claws; slightly glossier than skin
  const bone = mats.make({ map: '/textures/plaster.jpg', tint: new Color(1.6, 1.55, 1.4), roughness: 0.35 })
  // HAIR_COLOR (0.75, 0.62, 0.3): warm blonde mane. NOT linen: linen.jpg is BLUE and
  // turns any gold tint sage; the flesh map under a strong gold reads as blond hair
  const hair = mats.make({ map: '/textures/skin.jpg', tint: new Color('#e9b84f').multiplyScalar(1.4), repeat: 2, roughness: 0.75 })
  // RED_COLOR (0.4, 0.1, 0.07): exposed muscle at wrists and ankles
  const red = mats.make({ map: '/textures/skin.jpg', tint: 0x99271c, roughness: 0.6 })
  const dark = mats.make({ map: '/textures/bark.jpg', tint: 0x2a1710, roughness: 0.6 })
  // feral yellow-green stare (CC0 photo, README credits) behind the bone mask
  const eye = mats.decal('/textures/eye-feral.jpg', { feather: true })

  const group = new Group()
  group.scale.setScalar(t.height / NATIVE_H)

  // torso: chest wedge, abs, waist, pelvis; lean pivot at the hips
  const torso = PartFrame.at(group, 0, 0, 2.8)
  torso.ball(skin, 0, 0.05, 4.3, 0.2)
  torso.ball(skin, 0, 0.07, 4.2, 0.24)
  for (const s of [1, -1]) {
    torso.ball(skin, s * 0.32, 0.06, 4.18, 0.28)
    torso.ball(skin, s * 0.32, 0.1, 3.72, 0.24)
    torso.ball(skin, s * 0.52, 0.04, 4.12, 0.3)
    torso.ball(skin, s * 0.21, 0.0, 2.68, 0.28)
  }
  torso.ball(skin, 0, 0.04, 3.95, 0.46)
  torso.ball(skin, 0, 0.15, 3.98, 0.36)
  torso.ball(skin, 0, -0.05, 3.9, 0.35)
  torso.ball(skin, 0, -0.02, 3.5, 0.33)
  torso.ball(skin, 0, -0.02, 3.3, 0.3)
  torso.ball(skin, 0, 0.0, 3.12, 0.3)
  torso.ball(skin, 0, 0.0, 2.8, 0.38)
  torso.ball(skin, 0, 0.12, 2.75, 0.27)

  // head: skull + jaw with the white bone muzzle mask and jagged teeth arc
  const head = torso.child(0, 0.05, 4.3)
  head.ball(skin, 0, 0.02, 4.63, 0.28)
  head.ball(skin, 0, 0.05, 4.75, 0.24)
  head.ball(skin, 0, -0.06, 4.45, 0.17)
  const maskFront = -0.25 // build.py probes the metaball surface; the jaw ball front
  head.ball(bone, 0, maskFront + 0.06, 4.45, 0.21, { scale: [1.1, 0.5, 0.85] })
  head.box(dark, 0, maskFront - 0.02, 4.38, [0.4, 0.07, 0.09])
  for (let i = 0; i < 7; i++) {
    const tx = -0.18 + i * 0.06
    head.box(bone, tx, maskFront - 0.04, 4.38, [0.045, 0.07, 0.12], [0, i % 2 ? 0.35 : -0.35, 0])
  }
  const eyeFront = -0.25
  for (const s of [1, -1]) {
    head.ball(red, s * 0.12, eyeFront + 0.045, 4.66, 0.085, { scale: [1.1, 0.35, 1.0] })
    head.ball(dark, s * 0.12, eyeFront + 0.03, 4.66, 0.07, { scale: [1.1, 0.4, 0.95] })
    head.plane(eye, s * 0.12, eyeFront - 0.03, 4.66, 0.28, 0.24)
  }
  // huge blonde mane: crown, top, the long back mass to the chest, side falls;
  // the particle halo becomes an enlarged shell plus seeded spikes radiating out
  head.ball(hair, 0, 0.08, 4.82, 0.31, { scale: [1.25, 1.3, 0.9] })
  head.ball(hair, 0, 0.28, 4.72, 0.24, { scale: [1.25, 1.05, 1.05] })
  head.ball(hair, 0, 0.26, 4.32, 0.24, { scale: [1.4, 0.75, 2.5] })
  for (const s of [1, -1]) head.ball(hair, s * 0.26, 0.1, 4.32, 0.16, { scale: [0.65, 0.95, 2.3] })
  const shag = createRng(t.id * 7919 + 47)
  for (let i = 0; i < 11; i++) {
    const angle = (i / 11) * Math.PI * 2
    const rx = Math.cos(angle) * 0.28
    const rz = Math.sin(angle) * 0.24
    head.ball(hair, rx, 0.14 + shag() * 0.14, 4.84 + rz * 0.7, 0.09 + shag() * 0.05, {
      scale: [0.6, 2.6 + shag() * 1.4, 0.6],
      rot: [rz * 2.2, 0, rx * 2.4],
    })
  }

  // arms: slightly long for the lunging crouch; claws ride the forearm
  const arm = (s: number): Limb & { wrist: PartFrame } => {
    const pivot = torso.child(s * 0.57, 0.04, 4.05)
    pivot.chain(skin, s * 0.57, 0.04, 4.05, s * 0.66, -0.04, 3.3, 0.24, 0.19)
    const wrist = pivot.child(s * 0.66, -0.04, 3.3)
    wrist.chain(skin, s * 0.66, -0.04, 3.3, s * 0.7, -0.13, 2.45, 0.2, 0.15)
    wrist.ball(skin, s * 0.7, -0.16, 2.35, 0.15)
    wrist.ball(skin, s * 0.7, -0.2, 2.18, 0.12)
    wrist.ball(red, s * 0.7, -0.15, 2.32, 0.13, { scale: [1.1, 1.1, 0.6] })
    for (const cx of [0.62, 0.7, 0.78]) {
      wrist.ball(bone, s * cx, -0.24, 2.02, 0.045, { scale: [0.5, 0.7, 2.2], rot: [0.15, 0, 0], segments: 8 })
    }
    return { pivot: pivot.node, lower: wrist.node, wrist }
  }
  const armL = arm(1)
  const armR = arm(-1)

  // legs: quads/hams on the thigh, calf + foot + toe claws below the knee
  const leg = (s: number): Limb & { knee: PartFrame } => {
    const pivot = PartFrame.at(group, s * 0.26, 0.0, 2.6)
    pivot.chain(skin, s * 0.26, 0.0, 2.6, s * 0.29, -0.05, 1.5, 0.34, 0.24)
    pivot.ball(skin, s * 0.28, -0.14, 2.1, 0.22)
    pivot.ball(skin, s * 0.27, 0.13, 2.1, 0.2)
    const knee = pivot.child(s * 0.29, -0.01, 1.5)
    knee.chain(skin, s * 0.29, -0.01, 1.5, s * 0.27, 0.03, 0.24, 0.25, 0.16)
    knee.ball(skin, s * 0.28, 0.13, 1.15, 0.16)
    knee.ball(skin, s * 0.26, -0.09, 0.22, 0.17)
    knee.ball(skin, s * 0.26, -0.25, 0.19, 0.15)
    knee.ball(skin, s * 0.26, -0.4, 0.16, 0.13)
    knee.ball(skin, s * 0.26, 0.07, 0.19, 0.14)
    knee.ball(red, s * 0.26, -0.02, 0.32, 0.13, { scale: [1.05, 1.05, 0.5] })
    for (const cx of [0.18, 0.26, 0.34]) {
      knee.ball(bone, s * cx, -0.52, 0.14, 0.04, { scale: [0.5, 2.2, 0.7], segments: 8 })
    }
    return { pivot: pivot.node, lower: knee.node, knee }
  }
  const legL = leg(1)
  const legR = leg(-1)

  // Weak Point anchors: lat +0.12 is the LEFT ankle; the jaw part is the mask itself
  const anchors: Record<string, Object3D> = {
    ankle: legL.knee.anchor(0.26, -0.05, 0.3),
    jaw: head.anchor(0, -0.24, 4.42),
    nape: torso.anchor(0, 0.32, 4.15), // on the mane's back mass, like every covered nape
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
