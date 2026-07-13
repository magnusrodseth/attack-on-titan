import { Color, Group, type Object3D, type Scene } from 'three'
import type { BossFight } from '../../sim/boss'
import { createRng } from '../../sim/rng'
import type { TitanState } from '../../sim/titan'
import type { Limb } from '../titans'
import { TitanPoser } from '../titans'
import type { BossBodyVisual } from './lib'
import { MatBag, PartFrame } from './lib'

/**
 * Cart Titan, ported from blender/titans/cart/build.py: the quadruped. Human arms as
 * forelegs (elbows locked, palms on the ground), Z-folded hind legs, arched spine,
 * long muzzle with big lips, shaggy brown crown. Every coordinate below is the
 * build.py number, mirrored explicitly where the metaball family used mirror=True.
 *
 * Scale: the sim's part anchors are authoritative, and they were authored for a low
 * quadruped: nape up=0.55 lands on the neck-back (Blender z 3.0) when world scale is
 * t.height * 0.55 / 3.0. At the spec's h=10 that reads ~5.9 m at the head, ~13 m nose
 * to rump, and the foreleg/haunch/nape anchors all land on real anatomy (the old glb
 * bounding-box fit blew the statue up past its own hitboxes).
 */

const NAPE_Z = 3.0
const NAPE_UP = 0.55

export function buildCartTitan(t: TitanState): BossBodyVisual {
  const mats = new MatBag()
  // SKIN_COLOR (0.55, 0.35, 0.3): mottled pink flesh, matte, no fiber striation
  const skin = mats.make({
    map: '/textures/skin.jpg',
    tint: new Color(1.2, 0.73, 0.66), // the build.py mauve-pink, multiplied over the flesh map
    repeat: 2,
    roughness: 0.65,
    normal: '/textures/wall_nor.jpg',
    normalScale: 0.35,
  })
  // LIP_COLOR (0.45, 0.28, 0.22)
  const lip = mats.make({ map: '/textures/skin.jpg', tint: new Color(0.9, 0.56, 0.44), roughness: 0.55 })
  // HAIR_COLOR (0.15, 0.1, 0.06): dark brown shag over the bark map
  const hair = mats.make({ map: '/textures/bark.jpg', tint: 0x6b4c33, repeat: 2, roughness: 0.8 })
  // FaceDark (0.07, 0.03, 0.02): mouth slit and eye sockets
  const dark = mats.make({ map: '/textures/bark.jpg', tint: 0x2a1710, roughness: 0.6 })
  // Eye (0.55, 0.4, 0.18), emission 0.5: dark amber
  const eye = mats.make({
    map: '/textures/skin.jpg',
    tint: 0xd6a145,
    roughness: 0.25,
    emissive: 0x8a6420,
    emissiveIntensity: 0.6,
  })

  const group = new Group()
  const scale = (t.height * NAPE_UP) / NAPE_Z
  group.scale.setScalar(scale)

  // torso pivot at mid-spine so chase lean and stagger reel rock the body naturally
  const torso = PartFrame.at(group, 0, 0.3, 2.2)

  // spine / neck / shoulders / belly / rump (the metaball core)
  torso.chain(skin, 0, -1.6, 2.5, 0, 2.2, 2.3, 0.85, 0.85)
  torso.ball(skin, 0, -2.3, 2.4, 0.55)
  torso.ball(skin, 0, -1.95, 2.45, 0.6)
  for (const s of [1, -1]) torso.ball(skin, s * 0.5, -1.4, 2.6, 0.55)
  torso.ball(skin, 0, -1.5, 2.2, 0.75)
  torso.ball(skin, 0, 0.1, 2.1, 0.75)
  torso.ball(skin, 0, -0.7, 2.2, 0.75)
  torso.ball(skin, 0, 2.5, 2.15, 0.7)
  for (const s of [1, -1]) torso.ball(skin, s * 0.55, 2.2, 2.05, 0.6)

  // head hangs off the neck joint; the poser lunges it for the bite
  const head = torso.child(0, -2.3, 2.45)
  head.ball(skin, 0, -2.9, 2.55, 0.5)
  head.ball(skin, 0, -2.7, 2.7, 0.42)
  head.ball(skin, 0, -3.95, 2.02, 0.26)
  head.chain(skin, 0, -3.0, 2.4, 0, -3.9, 2.08, 0.42, 0.28)
  // big fleshy lips wrapping the muzzle end; between them, rotten human teeth
  // and diseased gums (CDC PHIL #19466, public domain — see README credits)
  head.ball(lip, 0, -3.98, 2.05, 0.3, { scale: [1.1, 0.55, 0.75] })
  head.plane(mats.decal('/textures/teeth-rot.jpg', { feather: true }), 0, -4.21, 2.03, 0.4, 0.26)
  // eyes high on the skull (skull-front depth hardcoded in build.py), ears
  for (const s of [1, -1]) {
    head.ball(dark, s * 0.24, -3.14, 2.58, 0.09, { scale: [1.1, 0.3, 0.8] })
    head.ball(eye, s * 0.24, -3.15, 2.58, 0.038)
    head.ball(skin, s * 0.5, -2.55, 2.58, 0.15, { scale: [0.35, 0.6, 1.0], rot: [0.2, s * 0.4, 0] })
  }
  // brown shaggy crown: the particle-hair mass becomes an oversize shell plus seeded
  // tufts splaying past the brow and temples, so the fur reads at game distance
  head.ball(hair, 0, -2.85, 2.98, 0.5, { scale: [1.2, 1.55, 0.62] })
  const shag = createRng(t.id * 7919 + 31)
  for (let i = 0; i < 10; i++) {
    const x = (shag() - 0.5) * 1.1
    const y = -3.35 + shag() * 0.95 // strands spill from the brow back toward the neck
    head.ball(hair, x, y, 2.95 + shag() * 0.2, 0.12 + shag() * 0.08, {
      scale: [0.8, 2.0 + shag() * 1.4, 0.55],
      rot: [0.4 + shag() * 0.5, (shag() - 0.5) * 0.8, 0],
    })
  }

  // forelegs: straight human arms, palms flat, fingers forward
  const foreleg = (s: number): Limb & { wrist: PartFrame } => {
    const pivot = torso.child(s * 0.8, -1.7, 2.3)
    pivot.chain(skin, s * 0.8, -1.7, 2.3, s * 0.85, -1.85, 0.4, 0.42, 0.3)
    const wrist = pivot.child(s * 0.85, -1.85, 0.5)
    wrist.ball(skin, s * 0.85, -1.95, 0.3, 0.3)
    wrist.ball(skin, s * 0.85, -2.3, 0.24, 0.26)
    wrist.ball(skin, s * 0.65, -2.55, 0.18, 0.11)
    wrist.ball(skin, s * 0.85, -2.6, 0.19, 0.12)
    wrist.ball(skin, s * 1.05, -2.55, 0.18, 0.11)
    return { pivot: pivot.node, lower: wrist.node, wrist }
  }
  const armL = foreleg(1)
  const armR = foreleg(-1)

  // hind legs: crouched Z-fold, knees forward, ankles back, feet flat
  const hindLeg = (s: number): Limb & { hip: PartFrame } => {
    const hip = torso.child(s * 0.7, 1.9, 2.0)
    hip.chain(skin, s * 0.7, 1.9, 2.0, s * 0.8, 1.2, 1.05, 0.62, 0.44)
    const knee = hip.child(s * 0.8, 1.2, 1.05)
    knee.chain(skin, s * 0.8, 1.2, 1.05, s * 0.78, 2.3, 0.5, 0.42, 0.3)
    knee.chain(skin, s * 0.78, 2.35, 0.4, s * 0.78, 1.7, 0.25, 0.27, 0.22)
    knee.ball(skin, s * 0.78, 2.4, 0.3, 0.28)
    knee.ball(skin, s * 0.78, 1.9, 0.24, 0.24)
    knee.ball(skin, s * 0.6, 1.6, 0.18, 0.1)
    knee.ball(skin, s * 0.78, 1.55, 0.19, 0.11)
    knee.ball(skin, s * 0.96, 1.6, 0.18, 0.1)
    return { pivot: hip.node, lower: knee.node, hip }
  }
  const legL = hindLeg(1)
  const legR = hindLeg(-1)

  // Weak Point anchors on the anatomy the sim's part spec points at
  const anchors: Record<string, Object3D> = {
    nape: torso.anchor(0, -2.0, NAPE_Z), // back of the neck, behind the crown
    foreleg: armL.wrist.anchor(0.85, -1.9, 0.45), // lat +0.12: the LEFT wrist
    haunch: legR.hip.anchor(-1.15, 1.65, 1.8), // lat -0.14: the RIGHT outer thigh
  }

  const poser = new TitanPoser(
    {
      group,
      torso: torso.node,
      head: head.node,
      legL,
      legR,
      armL,
      armR,
      setFade: (fade) => mats.setFade(fade),
    },
    { quadruped: true },
  )
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
