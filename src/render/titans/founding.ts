import { Color, Group, type Object3D, type Scene } from 'three'
import type { BossFight } from '../../sim/boss'
import type { TitanState } from '../../sim/titan'
import type { Limb } from '../titans'
import { TitanPoser } from '../titans'
import type { BossBodyVisual } from './lib'
import { MatBag, PartFrame } from './lib'

/**
 * Founding Titan (Ymir Fritz's form), ported from blender/titans/founding/
 * build.py: the gaunt pale giant. Exposed rib bands over a sunken chest with
 * the dark sternum cavity, drooping rib tendrils, hollow eye sockets with
 * pin-point pale eyes, gaping mouth, long swept-back hair. Native H = 13 m
 * scales x1.54 to the sim's 20 m apex height. Surface features sit on the raw
 * sphere fronts (the blender build probed its slimmer metaball surface).
 */

const NATIVE_H = 13.0

export function buildFoundingTitan(t: TitanState): BossBodyVisual {
  const mats = new MatBag()
  // BODY_COLOR (0.52, 0.46, 0.4): pale grey-tan, faint striation
  const body = mats.make({
    map: '/textures/plaster.jpg',
    tint: new Color(1.24, 1.2, 1.12), // cooled toward ancient bone-grey
    repeat: 2,
    roughness: 0.65,
    normal: '/textures/planks_nor.jpg',
    normalScale: 0.35,
  })
  // BONE_COLOR (0.62, 0.56, 0.48): ribs and tendrils, paler than the skin
  const bone = mats.make({ map: '/textures/plaster.jpg', tint: new Color(1.5, 1.36, 1.16), roughness: 0.55 })
  const hair = mats.make({ map: '/textures/bark.jpg', tint: 0x181210, repeat: 2, roughness: 0.8 })
  const dark = mats.make({ map: '/textures/bark.jpg', tint: 0x171009, roughness: 0.6 })
  // the double-pupiled eye (CC0, README credits): the founder sees wrong
  const eye = mats.decal('/textures/eye-double-pupil.png', { feather: true })

  const group = new Group()
  group.scale.setScalar(t.height / NATIVE_H)

  // torso: sunken chest, narrow shoulders, wasp waist
  const torso = PartFrame.at(group, 0, 0, 7.3)
  torso.ball(body, 0, 0.1, 11.4, 0.38)
  torso.ball(body, 0, 0.15, 11.1, 0.45)
  for (const s of [1, -1]) {
    torso.ball(body, s * 0.6, 0.15, 10.85, 0.55)
    torso.ball(body, s * 0.55, 0.05, 10.15, 0.7)
    torso.ball(body, s * 0.5, 0.0, 7.0, 0.7)
    torso.ball(body, s * 1.3, 0.08, 10.55, 0.6)
  }
  torso.ball(body, 0, 0.1, 10.2, 1.25)
  torso.ball(body, 0, 0.4, 10.25, 0.95)
  torso.ball(body, 0, -0.05, 9.2, 0.85)
  torso.ball(body, 0, -0.05, 8.6, 0.75)
  torso.ball(body, 0, 0.0, 8.15, 0.72)
  torso.ball(body, 0, 0.0, 7.3, 0.95)
  torso.ball(body, 0, 0.3, 7.15, 0.7)
  // rib bands wrapping the sunken chest + the dark sternum cavity + tendrils
  for (const rz of [10.55, 10.25, 9.95, 9.65]) {
    for (const s of [1, -1]) {
      torso.ball(bone, s * 0.5, -0.95, rz, 0.4, { scale: [1.1, 0.35, 0.2], rot: [0.2, 0, s * -0.15] })
    }
  }
  torso.ball(dark, 0, -1.12, 10.1, 0.28, { scale: [0.9, 0.25, 1.15] })
  for (const s of [1, -1]) {
    torso.ball(bone, s * 0.7, -0.75, 8.6, 0.09, { scale: [0.4, 0.4, 3.4], rot: [0.1, s * 0.12, 0], segments: 8 })
    torso.ball(bone, s * 0.85, -0.75, 8.8, 0.09, { scale: [0.4, 0.4, 3.4], rot: [0.1, s * 0.12, 0], segments: 8 })
  }

  // head: hollow sockets, pin-point eyes, gaping mouth with upper teeth row
  const head = torso.child(0, 0.1, 11.4)
  head.ball(body, 0, 0.05, 12.2, 0.6)
  head.ball(body, 0, 0.1, 12.5, 0.52)
  head.ball(body, 0, -0.12, 11.75, 0.34)
  for (const s of [1, -1]) {
    head.ball(dark, s * 0.2, -0.52, 12.3, 0.16, { scale: [1.1, 0.4, 1.25] })
    head.plane(eye, s * 0.2, -0.58, 12.3, 0.5, 0.44)
  }
  // the gaping mouth is a lamprey maw: concentric horn-tooth rings around a dark
  // throat (U.S. EPA photo, public domain — see README credits), feathered into
  // the jaw over a recessed dark hollow
  head.ball(dark, 0, -0.3, 11.78, 0.3, { scale: [1.0, 0.4, 0.8] })
  head.plane(mats.decal('/textures/maw-lamprey.jpg', { feather: true, tint: 0xcfc2b2 }), 0, -0.5, 11.76, 1.2, 0.85)
  // long hair swept back from a high hairline, falling to mid-back
  head.ball(hair, 0, 0.22, 12.7, 0.56, { scale: [1.05, 1.2, 0.6] })
  head.ball(hair, 0, 0.6, 11.3, 0.4, { scale: [0.9, 0.5, 3.0] })
  for (const s of [1, -1]) head.ball(hair, s * 0.34, 0.3, 12.1, 0.16, { scale: [0.5, 0.7, 2.4] })

  // arms: long, thin, sinewy, oversized hands
  const arm = (s: number): Limb & { wrist: PartFrame } => {
    const pivot = torso.child(s * 1.42, 0.05, 10.45)
    pivot.chain(body, s * 1.42, 0.05, 10.45, s * 1.7, -0.15, 8.4, 0.5, 0.4)
    const wrist = pivot.child(s * 1.7, -0.15, 8.4)
    wrist.chain(body, s * 1.7, -0.15, 8.4, s * 1.85, -0.35, 6.2, 0.42, 0.32)
    wrist.ball(body, s * 1.85, -0.42, 5.9, 0.42)
    wrist.ball(body, s * 1.85, -0.55, 5.5, 0.34)
    wrist.ball(body, s * 1.68, -0.6, 5.25, 0.13)
    wrist.ball(body, s * 1.85, -0.65, 5.2, 0.14)
    wrist.ball(body, s * 2.02, -0.6, 5.25, 0.13)
    return { pivot: pivot.node, lower: wrist.node, wrist }
  }
  const armL = arm(1)
  const armR = arm(-1)

  // legs: thin, long
  const leg = (s: number): Limb & { knee: PartFrame } => {
    const hip = PartFrame.at(group, s * 0.6, 0, 6.8)
    hip.chain(body, s * 0.6, 0.0, 6.8, s * 0.68, -0.1, 3.9, 0.75, 0.5)
    const knee = hip.child(s * 0.68, -0.02, 3.9)
    knee.chain(body, s * 0.68, -0.02, 3.9, s * 0.62, 0.05, 0.65, 0.52, 0.32)
    knee.ball(body, s * 0.62, -0.25, 0.45, 0.4)
    knee.ball(body, s * 0.62, -0.68, 0.38, 0.36)
    knee.ball(body, s * 0.62, -1.1, 0.32, 0.3)
    knee.ball(body, s * 0.62, 0.12, 0.4, 0.32)
    knee.ball(body, s * 0.44, -1.35, 0.24, 0.12)
    knee.ball(body, s * 0.62, -1.4, 0.25, 0.13)
    knee.ball(body, s * 0.8, -1.35, 0.24, 0.12)
    return { pivot: hip.node, lower: knee.node, knee }
  }
  const legL = leg(1)
  const legR = leg(-1)

  // Weak Points: LEFT ankle (lat +0.12), RIGHT wrist (lat -0.22), Spine Ridge
  // (behind, mid-back), LEFT eye (lat +0.04), nape last
  const anchors: Record<string, Object3D> = {
    ankle: legL.knee.anchor(0.62, -0.3, 0.45),
    wrist: armR.wrist.anchor(-1.85, -0.5, 5.9),
    spine: torso.anchor(0, 0.55, 8.2),
    eye: head.anchor(0.2, -0.58, 12.3),
    nape: torso.anchor(0, 0.45, 10.9),
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
