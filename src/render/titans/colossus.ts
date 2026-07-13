import { Color, Group, type Object3D, type Scene } from 'three'
import type { BossFight } from '../../sim/boss'
import type { TitanState } from '../../sim/titan'
import type { Limb } from '../titans'
import { TitanPoser } from '../titans'
import type { BossBodyVisual } from './lib'
import { MatBag, PartFrame } from './lib'

/**
 * Colossus Titan, ported from blender/titans/colossus/build.py: the 60 m wall
 * giant. Rangy long-limbed body of crimson exposed muscle with pale sinew
 * streaks (shins, knees, IT bands, forearms, spine, achilles), the skeletal
 * ear-to-ear grin, lidless pale eyes, heavy brow, bald fiber skull. Native
 * H = 60 m equals the sim height. On top of the shared poser it breathes: a
 * slow sway when idle and a vent shudder while the steam aura is on.
 */

const NATIVE_H = 60.0

export function buildColossusTitan(t: TitanState): BossBodyVisual {
  const mats = new MatBag()
  // MUSCLE_COLOR (0.42, 0.1, 0.07): deep crimson vertical fiber
  const muscle = mats.make({
    map: '/textures/bark.jpg',
    tint: new Color(1.6, 0.45, 0.34),
    repeat: 4,
    roughness: 0.65,
  })
  // SINEW_COLOR (0.78, 0.64, 0.55): pale tendon streaks
  const sinew = mats.make({ map: '/textures/skin.jpg', tint: new Color(1.35, 1.15, 1.0), repeat: 2, roughness: 0.5 })
  const dark = mats.make({ map: '/textures/bark.jpg', tint: 0x24130c, roughness: 0.6 })
  const tooth = mats.make({ map: '/textures/plaster.jpg', tint: new Color(1.5, 1.46, 1.36), roughness: 0.35 })
  // wide blank lidless stare (PD photo, README credits), washed pale
  const eye = mats.decal('/textures/eye-stare.jpg', { feather: true, tint: 0xd8d2c2 })

  const group = new Group()
  group.scale.setScalar(t.height / NATIVE_H)

  // torso: massive deep ribcage over a comparatively narrow waist
  const torso = PartFrame.at(group, 0, 0, 37)
  torso.ball(muscle, 0, 0.5, 53.5, 2.9)
  for (const s of [1, -1]) {
    torso.ball(muscle, s * 2.8, 0.8, 52.2, 2.9)
    torso.ball(muscle, s * 4.4, 0.4, 49.4, 4.4)
    torso.ball(muscle, s * 5.0, 1.2, 46.0, 3.4)
    torso.ball(muscle, s * 2.9, 0.0, 34.6, 3.5)
    torso.ball(muscle, s * 7.0, 0.4, 51.3, 3.0)
  }
  torso.ball(muscle, 0, 0.5, 49.5, 6.4)
  torso.ball(muscle, 0, -1.5, 49.8, 4.6)
  torso.ball(muscle, 0, 2.6, 49.6, 4.8)
  torso.ball(muscle, 0, -0.6, 44.5, 4.4)
  torso.ball(muscle, 0, -0.8, 42.0, 3.9)
  torso.ball(muscle, 0, 0.0, 40.0, 3.9)
  torso.ball(muscle, 0, 0.0, 37.0, 4.4)
  torso.ball(muscle, 0, 1.8, 36.5, 3.2)
  // spine sinew strip down the upper back
  torso.ball(sinew, 0, 5.5, 48.0, 1.2, { scale: [0.7, 0.5, 2.5] })

  // head: tiny for the body; bald fiber skull, grin, brow, lidless eyes
  const head = torso.child(0, 0.5, 53.5)
  head.ball(muscle, 0, 0.2, 56.5, 2.9)
  head.ball(muscle, 0, 0.35, 57.3, 2.5)
  head.ball(muscle, 0, -0.7, 54.4, 1.9)
  for (const s of [1, -1]) {
    head.ball(muscle, s * 1.35, 0.2, 57.0, 1.8)
    head.ball(muscle, s * 1.4, -0.3, 55.8, 0.75)
    head.ball(dark, s * 1.05, -2.5, 56.6, 0.68, { scale: [1.2, 0.3, 0.9] })
    head.plane(eye, s * 1.05, -2.72, 56.6, 1.1, 0.88)
    head.ball(muscle, s * 2.55, 0.3, 56.4, 0.55, { scale: [0.3, 0.6, 1.0], rot: [0.3, s * 0.4, 0] })
  }
  head.ball(muscle, 0, -2.0, 57.4, 1.3, { scale: [1.6, 0.45, 0.35] })
  head.ball(muscle, 0, -2.55, 55.9, 0.35, { scale: [0.7, 0.5, 0.9] })
  // the skeletal grin: teeth on a parabolic arc, dark gaps recessed behind
  const grinFront = -2.5
  for (let i = 0; i < 11; i++) {
    const tx = -1.9 + i * 0.38
    const ty = grinFront + 0.15 + 0.38 * (tx / 1.9) ** 2
    head.box(tooth, tx, ty, 54.8, [0.36, 0.44, 0.95])
    if (i < 10) head.box(dark, tx + 0.19, ty + 0.1, 54.8, [0.09, 0.38, 1.0])
  }

  // arms: long, big hands; chains overshoot the elbow like the build does
  const arm = (s: number): Limb & { wrist: PartFrame } => {
    const pivot = torso.child(s * 7.6, 0.3, 50.5)
    pivot.chain(muscle, s * 7.6, 0.3, 50.5, s * 8.45, -0.6, 40.2, 2.6, 2.1)
    const wrist = pivot.child(s * 8.4, -0.4, 41.0)
    wrist.chain(muscle, s * 8.35, -0.4, 41.8, s * 8.6, -1.2, 30.2, 2.15, 1.7)
    wrist.ball(muscle, s * 8.7, -1.5, 28.9, 2.0)
    wrist.ball(muscle, s * 8.7, -2.1, 26.8, 1.5)
    wrist.ball(muscle, s * 8.0, -2.2, 25.6, 0.62)
    wrist.ball(muscle, s * 8.7, -2.35, 25.4, 0.66)
    wrist.ball(muscle, s * 9.4, -2.2, 25.6, 0.62)
    wrist.ball(sinew, s * 8.9, -1.7, 34.0, 0.9, { scale: [0.5, 0.5, 3.0], rot: [0.1, 0, 0] })
    return { pivot: pivot.node, lower: wrist.node, wrist }
  }
  const armL = arm(1)
  const armR = arm(-1)

  // legs: the leggy silhouette — hip at 0.53 H, sinew at knee/shin/achilles
  const leg = (s: number): Limb & { knee: PartFrame } => {
    const hip = PartFrame.at(group, s * 3.4, 0, 32.8)
    hip.chain(muscle, s * 3.4, 0.0, 32.8, s * 3.9, -0.5, 17.5, 3.4, 2.3)
    hip.ball(muscle, s * 3.7, 1.6, 26.0, 2.4)
    hip.ball(sinew, s * 5.4, -0.5, 24.0, 1.2, { scale: [0.5, 0.5, 3.8] })
    const knee = hip.child(s * 3.9, -0.3, 18.0)
    knee.chain(muscle, s * 3.9, -0.2, 18.5, s * 3.6, 0.3, 4.0, 2.4, 1.4)
    knee.ball(muscle, s * 3.8, 1.5, 13.5, 1.9)
    knee.ball(muscle, s * 3.7, 1.2, 10.0, 1.6)
    knee.ball(muscle, s * 3.6, -1.0, 2.3, 2.0)
    knee.ball(muscle, s * 3.6, -3.0, 1.9, 1.8)
    knee.ball(muscle, s * 3.6, -5.0, 1.6, 1.55)
    knee.ball(muscle, s * 3.6, 0.8, 2.1, 1.7)
    knee.ball(muscle, s * 2.7, -6.1, 1.2, 0.62)
    knee.ball(muscle, s * 3.6, -6.3, 1.3, 0.66)
    knee.ball(muscle, s * 4.5, -6.1, 1.2, 0.62)
    knee.ball(sinew, s * 3.75, -2.6, 10.0, 1.1, { scale: [0.6, 0.45, 4.5] })
    knee.ball(sinew, s * 3.85, -2.9, 17.5, 1.5, { scale: [0.9, 0.5, 1.1] })
    knee.ball(sinew, s * 3.65, 1.9, 6.5, 0.8, { scale: [0.5, 0.5, 3.0] })
    return { pivot: hip.node, lower: knee.node, knee }
  }
  const legL = leg(1)
  const legR = leg(-1)

  // Weak Points: LEFT ankle, RIGHT calf, LEFT hand, nape (sim holds it at
  // 0.84h, the upper-back shelf below the actual neck)
  const anchors: Record<string, Object3D> = {
    ankle: legL.knee.anchor(3.6, -1.5, 2.3),
    calf: legR.knee.anchor(-3.85, 1.8, 8.5),
    hand: armL.wrist.anchor(8.7, -2.0, 27.5),
    nape: torso.anchor(0, 3.6, 50.6),
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
      if (titan.state === 'wander' || titan.state === 'chase') {
        const now = performance.now()
        // slow breathing sway; the whole wall of muscle shudders while venting
        torso.node.rotation.x += Math.sin(now * 0.0006) * 0.015
        if (fight.state.steamOn) {
          torso.node.rotation.z = Math.sin(now * 0.03) * 0.006
          group.position.y += Math.abs(Math.sin(now * 0.028)) * 0.09
        } else {
          torso.node.rotation.z = 0
        }
      }
    },
    partAnchor(partId: string) {
      return anchors[partId] ?? null
    },
  }
}
