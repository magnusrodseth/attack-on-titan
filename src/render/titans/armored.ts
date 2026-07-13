import { Color, Group, type Object3D, type Scene } from 'three'
import type { BossFight } from '../../sim/boss'
import type { TitanState } from '../../sim/titan'
import type { Limb } from '../titans'
import { TitanPoser } from '../titans'
import type { BossBodyVisual } from './lib'
import { MatBag, PartFrame } from './lib'

/**
 * Armored Titan, ported from blender/titans/armored/build.py: segmented cream
 * armor plates over a dark maroon muscle underbody — the defining look is the
 * dark muscle showing in every plate gap, and the red/white stripes down the
 * legs. Plates are the build.py squashed spheres, assigned to the limb frame
 * they ride so the armor moves with the gait. Native H = 15 m = sim height.
 */

const NATIVE_H = 15.0

/** One PLATES row: squashed sphere with blender rot; mirror flips ry/rz. */
type PlateSpec = readonly [number, number, number, number, readonly [number, number, number], readonly [number, number, number]]

export function buildArmoredTitan(t: TitanState): BossBodyVisual {
  const mats = new MatBag()
  // MUSCLE_COLOR (0.30, 0.08, 0.06): dark maroon fiber in the plate gaps
  const muscle = mats.make({
    map: '/textures/bark.jpg',
    tint: new Color(1.25, 0.38, 0.3),
    repeat: 3,
    roughness: 0.6,
  })
  // PLATE_COLOR (0.58, 0.45, 0.27): warm cream slabs, wood-grain-like bump
  const plateMat = mats.make({
    map: '/textures/plaster.jpg',
    tint: new Color('#e8d0a8').multiplyScalar(1.55),
    roughness: 0.55,
    normal: '/textures/wall_nor.jpg',
    normalScale: 0.45,
  })
  const hair = mats.make({ map: '/textures/skin.jpg', tint: new Color('#f4dc96').multiplyScalar(1.35), repeat: 2, roughness: 0.7 })
  const dark = mats.make({ map: '/textures/bark.jpg', tint: 0x1f0d0a, roughness: 0.5 })
  const tooth = mats.make({ map: '/textures/plaster.jpg', tint: new Color(1.5, 1.45, 1.3), roughness: 0.35 })
  // glowing white eyes in dark sockets (emissive: gameplay-adjacent identity glow)
  const eye = mats.make({
    map: '/textures/skin.jpg',
    tint: 0xffffff,
    roughness: 0.2,
    emissive: 0xfff6e0,
    emissiveIntensity: 1.6,
  })

  const group = new Group()
  group.scale.setScalar(t.height / NATIVE_H)

  const plateInto = (frame: PartFrame, specs: readonly PlateSpec[], mirror: boolean): void => {
    for (const [x, y, z, r, s, rot] of specs) {
      frame.ball(plateMat, x, y, z, r, { scale: s, rot, segments: 14 })
      if (mirror && Math.abs(x) > 1e-6) {
        frame.ball(plateMat, -x, y, z, r, { scale: s, rot: [rot[0], -rot[1], -rot[2]], segments: 14 })
      }
    }
  }

  // torso: extremely bulky — wide traps, deep chest, thick abs and pelvis
  const torso = PartFrame.at(group, 0, 0, 8.5)
  torso.ball(muscle, 0, 0.1, 13.3, 0.85)
  torso.ball(muscle, 0, 0.7, 13.3, 0.9)
  for (const s of [1, -1]) {
    torso.ball(muscle, s * 1.05, 0.15, 12.9, 1.2)
    torso.ball(muscle, s * 1.0, 0.1, 11.9, 1.4)
    torso.ball(muscle, s * 1.25, 0.35, 11.2, 1.2)
    torso.ball(muscle, s * 0.8, 0.0, 8.1, 1.15)
  }
  torso.ball(muscle, 0, 0.15, 12.1, 1.95)
  torso.ball(muscle, 0, -0.75, 12.0, 1.35)
  torso.ball(muscle, 0, 0.9, 12.2, 1.35)
  torso.ball(muscle, 0, 0.0, 10.6, 1.7)
  torso.ball(muscle, 0, -0.05, 9.6, 1.6)
  torso.ball(muscle, 0, -0.5, 10.0, 1.2)
  torso.ball(muscle, 0, 0.0, 9.0, 1.5)
  torso.ball(muscle, 0, 0.0, 8.5, 1.5)
  torso.ball(muscle, 0, 0.6, 8.3, 1.05)
  // torso plates: pecs, rib bands, ab grid, obliques, collar, sternum, back column
  plateInto(
    torso,
    [
      [0.78, -1.55, 12.3, 0.8, [1.15, 0.32, 0.95], [0.2, 0, 0]],
      [0.6, -1.45, 11.42, 0.5, [1.35, 0.25, 0.34], [0.1, 0, 0]],
      [0.55, -1.48, 11.05, 0.48, [1.3, 0.24, 0.32], [0.05, 0, 0]],
      [0.5, -1.46, 10.7, 0.45, [1.2, 0.22, 0.3], [0, 0, 0]],
      [0.38, -1.48, 10.32, 0.4, [1.05, 0.3, 0.95], [0, 0, 0]],
      [0.38, -1.46, 9.68, 0.4, [1.05, 0.3, 0.95], [0, 0, 0]],
      [0.38, -1.35, 9.05, 0.42, [1.05, 0.3, 0.95], [-0.1, 0, 0]],
      [1.22, -0.65, 9.9, 0.5, [0.65, 0.35, 1.5], [0, 0, -0.25]],
      [0.8, -0.5, 13.35, 0.58, [1.35, 0.5, 0.55], [0.3, 0, 0]],
      [1.0, 1.45, 12.3, 0.65, [1.15, 0.35, 1.25], [0, 0, 0.2]],
      [0.65, 1.25, 8.3, 0.55, [1.05, 0.45, 0.95], [0, 0, 0]],
    ],
    true,
  )
  plateInto(
    torso,
    [
      [0.0, -1.05, 13.05, 0.44, [1.05, 0.4, 0.55], [0.3, 0, 0]],
      [0.0, 1.75, 12.5, 0.5, [0.95, 0.35, 1.05], [0, 0, 0]],
      [0.0, 1.7, 11.4, 0.48, [0.9, 0.35, 1.05], [0, 0, 0]],
      [0.0, 1.5, 10.3, 0.45, [0.85, 0.35, 0.95], [0, 0, 0]],
      [0.0, 1.35, 8.8, 0.44, [0.95, 0.4, 0.85], [0, 0, 0]],
    ],
    false,
  )

  // head sunk low in the plate collar: jaw mask, teeth row, glowing eyes, crop
  const head = torso.child(0, 0.1, 13.3)
  head.ball(muscle, 0, 0.05, 14.3, 0.78)
  head.ball(muscle, 0, 0.15, 14.7, 0.68)
  head.ball(muscle, 0, -0.3, 13.9, 0.6)
  // features sit proud of the raw skull sphere (the blender probe hit the fatter
  // blended metaball surface, so its +offsets would bury everything here)
  const eyeFront = -0.9
  const mouthFront = -0.85
  plateInto(head, [[0.0, eyeFront + 0.28, 14.52, 0.44, [1.25, 0.45, 0.36], [0.55, 0, 0]]], false)
  plateInto(head, [[0.36, eyeFront + 0.18, 14.0, 0.3, [0.75, 0.4, 1.1], [0, 0, -0.15]]], true)
  plateInto(head, [[0.0, mouthFront + 0.18, 13.45, 0.3, [0.85, 0.5, 0.5], [-0.25, 0, 0]]], false)
  for (const s of [1, -1]) {
    head.ball(dark, s * 0.27, eyeFront + 0.18, 14.22, 0.17, { scale: [1.0, 0.3, 0.85] })
    head.ball(eye, s * 0.27, eyeFront + 0.12, 14.22, 0.085)
  }
  head.box(dark, 0, mouthFront + 0.03, 13.75, [1.05, 0.16, 0.32])
  for (let i = 0; i < 7; i++) {
    head.box(tooth, -0.42 + i * 0.14, mouthFront - 0.05, 13.76, [0.115, 0.12, 0.22])
  }
  head.ball(hair, 0, 0.25, 14.95, 0.6, { scale: [1.05, 1.15, 0.5] })

  // arms: huge deltoid caps, outer-arm slabs, plated knuckles
  const arm = (s: number): Limb & { wrist: PartFrame } => {
    const pivot = torso.child(s * 2.3, 0.1, 12.3)
    pivot.chain(muscle, s * 2.3, 0.1, 12.3, s * 2.6, -0.1, 9.8, 1.0, 0.85)
    pivot.ball(muscle, s * 2.0, 0.1, 12.55, 1.25)
    plateInto(pivot, [[s * 2.05, 0.1, 12.9, 0.95, [1.05, 0.8, 0.85], [0, 0, 0]]], false)
    plateInto(pivot, [[s * 2.85, 0.0, 11.1, 0.55, [0.85, 0.6, 1.9], [0, s * 0.1, 0]]], false)
    const wrist = pivot.child(s * 2.6, -0.1, 9.8)
    wrist.chain(muscle, s * 2.6, -0.1, 9.8, s * 2.6, -0.4, 7.1, 0.85, 0.7)
    wrist.ball(muscle, s * 2.6, -0.55, 6.6, 0.7)
    wrist.ball(muscle, s * 2.6, -0.75, 6.0, 0.55)
    plateInto(wrist, [[s * 2.95, -0.35, 8.4, 0.5, [0.9, 0.6, 2.0], [0.1, 0, 0]]], false)
    plateInto(wrist, [[s * 2.65, -0.9, 6.4, 0.44, [1.05, 0.45, 0.95], [0.3, 0, 0]]], false)
    return { pivot: pivot.node, lower: wrist.node, wrist }
  }
  const armL = arm(1)
  const armR = arm(-1)

  // legs: the iconic stripes — plate strips down the front, red muscle behind
  const leg = (s: number): Limb & { hip: PartFrame } => {
    const hip = PartFrame.at(group, s * 1.0, 0, 7.9)
    hip.chain(muscle, s * 1.0, 0.0, 7.9, s * 1.05, -0.15, 4.7, 1.15, 0.85)
    hip.ball(muscle, s * 1.0, 0.5, 6.5, 0.8)
    plateInto(hip, [[s * 0.72, -0.9, 6.4, 0.46, [0.6, 0.4, 2.7], [0.12, 0, 0]]], false)
    plateInto(hip, [[s * 1.32, -0.8, 6.3, 0.42, [0.55, 0.4, 2.5], [0.12, 0, s * -0.1]]], false)
    plateInto(hip, [[s * 1.03, -0.85, 4.6, 0.46, [1.0, 0.45, 0.95], [0, 0, 0]]], false)
    const knee = hip.child(s * 1.05, -0.05, 4.7)
    knee.chain(muscle, s * 1.05, -0.05, 4.7, s * 1.0, 0.1, 1.3, 1.0, 0.65)
    knee.ball(muscle, s * 1.05, 0.45, 3.9, 0.75)
    knee.ball(muscle, s * 1.0, 0.35, 3.0, 0.65)
    knee.ball(muscle, s * 1.0, -0.35, 0.65, 0.75)
    knee.ball(muscle, s * 1.0, -1.1, 0.6, 0.65)
    knee.ball(muscle, s * 1.0, -1.85, 0.5, 0.55)
    knee.ball(muscle, s * 1.0, 0.2, 0.6, 0.55)
    plateInto(knee, [[s * 1.02, -0.6, 2.9, 0.42, [0.85, 0.45, 2.5], [-0.05, 0, 0]]], false)
    plateInto(knee, [[s * 1.0, -1.0, 0.9, 0.5, [1.25, 1.7, 0.6], [0.25, 0, 0]]], false)
    plateInto(knee, [[s * 1.0, -2.05, 0.55, 0.36, [1.15, 0.75, 0.6], [0.1, 0, 0]]], false)
    return { pivot: hip.node, lower: knee.node, hip }
  }
  const legL = leg(1)
  const legR = leg(-1)

  // Weak Points (all plated until cracked): LEFT shoulder plate, RIGHT knee
  // plate, nape. The sim holds the shoulder at 0.72h, low on the deltoid edge.
  const anchors: Record<string, Object3D> = {
    shoulder: torso.anchor(1.85, 0.2, 11.6),
    knee: legR.hip.anchor(-1.03, -0.95, 4.5),
    nape: torso.anchor(0, 0.85, 12.4),
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
