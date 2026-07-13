import { Color, Group, type Object3D, type Scene } from 'three'
import type { BossFight } from '../../sim/boss'
import type { TitanState } from '../../sim/titan'
import type { Limb } from '../titans'
import { TitanPoser } from '../titans'
import type { BossBodyVisual } from './lib'
import { MatBag, PartFrame } from './lib'

/**
 * War Hammer Titan, ported from blender/titans/warhammer/build.py: Lara Tybur's
 * slender marble giant. White-grey fibrous body, smooth bald dome with dark eye
 * slits (no eyeballs), the red/white striped muzzle band flowing into ringed
 * neck wraps, and the giant spiked war hammer. The hammer is built as its own
 * sub-group on the hammer-hand wrist (the sim's lat +0.22 "Hammer Wrist" side),
 * so a future weapon-construct mechanic can detach it. Native H = 15 m.
 */

const NATIVE_H = 15.0

export function buildWarhammerTitan(t: TitanState): BossBodyVisual {
  const mats = new MatBag()
  // BODY_COLOR (0.72, 0.72, 0.7): marble white-grey — plaster, not flesh, so the
  // "reads marble statue" checklist holds; plank normals for the fiber striation
  const body = mats.make({
    map: '/textures/plaster.jpg',
    tint: new Color(1.3, 1.34, 1.4), // cooled toward grey marble
    repeat: 2,
    roughness: 0.6,
    normal: '/textures/planks_nor.jpg',
    normalScale: 0.5,
  })
  // the head dome reads smooth marble: same tint, no fiber relief
  const dome = mats.make({ map: '/textures/plaster.jpg', tint: new Color(1.36, 1.4, 1.46), repeat: 2, roughness: 0.55 })
  // StripeRed (0.45, 0.1, 0.08) and StripeWhite (0.78, 0.76, 0.72)
  const red = mats.make({ map: '/textures/skin.jpg', tint: new Color('#a02318').multiplyScalar(1.15), roughness: 0.55 })
  // the hammer runs brighter than the body so the weapon separates from the flesh
  const white = mats.make({ map: '/textures/plaster.jpg', tint: new Color(1.75, 1.72, 1.62), roughness: 0.5 })
  const dark = mats.make({ map: '/textures/bark.jpg', tint: 0x140b09, roughness: 0.5 })

  const group = new Group()
  group.scale.setScalar(t.height / NATIVE_H)

  // torso: lean, long-legged, entirely white fiber
  const torso = PartFrame.at(group, 0, 0, 8.3)
  torso.ball(body, 0, 0.1, 13.05, 0.55)
  torso.ball(body, 0, 0.15, 12.8, 0.65)
  for (const s of [1, -1]) {
    torso.ball(body, s * 0.75, 0.18, 12.85, 0.8)
    torso.ball(body, s * 0.65, -0.35, 12.2, 0.72)
    torso.ball(body, s * 0.85, 0.1, 11.9, 0.9)
    torso.ball(body, s * 1.05, 0.35, 11.2, 0.85)
    torso.ball(body, s * 0.6, 0.0, 7.9, 0.95)
    torso.ball(body, s * 1.75, 0.1, 12.3, 0.85)
  }
  torso.ball(body, 0, 0.1, 11.95, 1.55)
  torso.ball(body, 0, 0.5, 12.0, 1.15)
  torso.ball(body, 0, -0.1, 10.7, 1.15)
  torso.ball(body, 0, -0.12, 9.9, 1.05)
  torso.ball(body, 0, 0.0, 9.3, 1.0)
  torso.ball(body, 0, 0.05, 8.3, 1.3)
  torso.ball(body, 0, 0.4, 8.1, 0.9)
  // neck rings: snug red wraps under the chin band
  for (const [i, rz] of [13.15, 13.0, 12.85].entries()) {
    torso.ball(red, 0, 0.1, rz, 0.46 + i * 0.02, { scale: [1.0, 1.0, 0.22] })
  }

  // head: smooth bald dome, dark eye slits, striped muzzle band
  const head = torso.child(0, 0.1, 13.05)
  head.ball(dome, 0, 0.05, 14.0, 0.68)
  head.ball(dome, 0, 0.1, 14.35, 0.6)
  head.ball(dome, 0, -0.15, 13.5, 0.42)
  head.ball(dome, 0, -0.05, 13.3, 0.4)
  const eyeFront = -0.68 // proud of the raw dome sphere (blender probed the fatter blend)
  for (const s of [1, -1]) {
    head.ball(dark, s * 0.22, eyeFront + 0.05, 14.1, 0.11, { scale: [1.2, 0.35, 0.45] })
  }
  const mouthFront = -0.62
  head.ball(white, 0, mouthFront + 0.16, 13.5, 0.34, { scale: [0.85, 0.35, 0.8] })
  for (let i = 0; i < 7; i++) {
    head.box(red, -0.24 + i * 0.08, mouthFront + 0.02, 13.48, [0.03, 0.1, 0.45])
  }

  // arms: the +x hand carries the hammer (the sim's Hammer Wrist side)
  const arm = (s: number): Limb & { wrist: PartFrame } => {
    const pivot = torso.child(s * 1.9, 0.1, 12.2)
    pivot.chain(body, s * 1.9, 0.1, 12.2, s * 2.2, -0.15, 9.9, 0.72, 0.58)
    pivot.ball(body, s * 2.05, -0.25, 11.2, 0.6)
    const wrist = pivot.child(s * 2.2, -0.15, 9.9)
    wrist.chain(body, s * 2.2, -0.15, 9.9, s * 2.35, -0.35, 7.3, 0.6, 0.48)
    wrist.ball(body, s * 2.35, -0.45, 6.9, 0.48)
    wrist.ball(body, s * 2.35, -0.6, 6.5, 0.38)
    return { pivot: pivot.node, lower: wrist.node, wrist }
  }
  const armL = arm(1)
  const armR = arm(-1)

  // the war hammer: pole + cross-hatched head + 3x3 spike grid, one detachable
  // group hanging from the hammer hand
  const hammer = armL.wrist.child(2.35, -0.5, 4.9)
  hammer.box(white, 2.35, -0.5, 4.9, [0.24, 0.24, 8.6])
  hammer.box(white, 2.35, -0.5, 1.2, [2.0, 1.5, 2.2])
  for (let ix = 0; ix < 3; ix++) {
    for (let iz = 0; iz < 3; iz++) {
      hammer.box(white, 2.35 - 0.6 + ix * 0.6, -1.6, 1.2 - 0.65 + iz * 0.65, [0.16, 0.9, 0.16])
    }
  }

  // legs: long and lean
  const leg = (s: number): Limb & { hip: PartFrame } => {
    const hip = PartFrame.at(group, s * 0.8, 0, 7.7)
    hip.chain(body, s * 0.8, 0.0, 7.7, s * 0.9, -0.12, 4.4, 1.0, 0.68)
    hip.ball(body, s * 0.85, -0.4, 6.3, 0.7)
    hip.ball(body, s * 0.8, -0.35, 5.6, 0.6)
    hip.ball(body, s * 0.85, 0.4, 6.3, 0.65)
    const knee = hip.child(s * 0.9, -0.02, 4.4)
    knee.chain(body, s * 0.9, -0.02, 4.4, s * 0.82, 0.08, 0.85, 0.72, 0.45)
    knee.ball(body, s * 0.9, 0.4, 3.5, 0.5)
    knee.ball(body, s * 0.85, 0.3, 2.9, 0.42)
    knee.ball(body, s * 0.8, -0.3, 0.55, 0.52)
    knee.ball(body, s * 0.8, -0.85, 0.45, 0.46)
    knee.ball(body, s * 0.8, -1.4, 0.4, 0.4)
    knee.ball(body, s * 0.8, 0.15, 0.5, 0.4)
    knee.ball(body, s * 0.58, -1.68, 0.3, 0.15)
    knee.ball(body, s * 0.8, -1.73, 0.31, 0.16)
    knee.ball(body, s * 1.02, -1.68, 0.3, 0.15)
    return { pivot: hip.node, lower: knee.node, hip }
  }
  const legL = leg(1)
  const legR = leg(-1)

  // Weak Points: Hammer Wrist lat +0.22 (left/hammer side), Shoulder lat -0.2
  // (right, sim holds it at 0.72h below the deltoid), Crystal Nape (plated)
  const anchors: Record<string, Object3D> = {
    wrist: armL.wrist.anchor(2.35, -0.5, 7.0),
    shoulder: torso.anchor(-1.55, 0.25, 11.5),
    nape: torso.anchor(0, 0.55, 12.3),
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
