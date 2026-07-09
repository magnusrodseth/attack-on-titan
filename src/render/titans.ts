import {
  BoxGeometry,
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  Scene,
  SphereGeometry,
} from 'three'
import { createRng } from '../sim/rng'
import type { TitanState } from '../sim/titan'
import { SWAT_WINDUP } from '../sim/titan'

/**
 * Procedural "pure titan": nude-look tan humanoid with a creepy grin and slightly wrong
 * proportions, per the user's reference images. Built at unit height and scaled by t.height.
 */
class TitanVisual {
  readonly group = new Group()
  private readonly skin: MeshStandardMaterial
  private readonly napeMat: MeshStandardMaterial
  private readonly legL: Group
  private readonly legR: Group
  private readonly armL: Group
  private readonly armR: Group
  private readonly torso: Group
  private walkPhase = 0
  private lastPos = { x: 0, z: 0 }

  constructor(t: TitanState) {
    const quirk = createRng(t.id * 7919 + 17)
    const skinTone = new Color().setHSL(0.07 + quirk() * 0.03, 0.35 + quirk() * 0.2, 0.55 + quirk() * 0.14)
    this.skin = new MeshStandardMaterial({ color: skinTone, roughness: 0.9, transparent: true })
    const dark = new MeshStandardMaterial({ color: 0x241a14, roughness: 0.9, transparent: true })
    const white = new MeshStandardMaterial({ color: 0xf5f0e6, roughness: 0.5, transparent: true })
    this.napeMat = new MeshStandardMaterial({
      color: 0xb3202a,
      emissive: 0xd42b35,
      emissiveIntensity: 0.8,
      transparent: true,
    })

    const headScale = 1 + quirk() * 0.45 // big heads read "pure titan"
    const bellyScale = 0.85 + quirk() * 0.6

    // legs with hip pivots
    this.legL = limb(this.skin, 0.1, 0.44, -0.08, 0.44)
    this.legR = limb(this.skin, 0.1, 0.44, 0.08, 0.44)

    this.torso = new Group()
    this.torso.position.y = 0.44
    const belly = new Mesh(new BoxGeometry(0.24 * bellyScale, 0.34, 0.15 * bellyScale), this.skin)
    belly.position.y = 0.17
    belly.castShadow = true
    this.torso.add(belly)

    // arms with shoulder pivots (hang stiff and creepy)
    this.armL = limb(this.skin, 0.075, 0.4 + quirk() * 0.12, -0.16, 0.32)
    this.armR = limb(this.skin, 0.075, 0.4 + quirk() * 0.12, 0.16, 0.32)
    this.torso.add(this.armL, this.armR)

    // head + face at the top of the torso group
    const head = new Group()
    head.position.y = 0.41
    const skull = new Mesh(new SphereGeometry(0.085 * headScale, 12, 10), this.skin)
    skull.scale.set(1, 1.15, 1)
    skull.castShadow = true
    head.add(skull)
    const r = 0.085 * headScale
    for (const side of [-1, 1]) {
      const eye = new Mesh(new BoxGeometry(0.024, 0.012, 0.01), white)
      eye.position.set(side * r * 0.42, r * 0.25, r * 0.92)
      head.add(eye)
    }
    const mouth = new Mesh(new BoxGeometry(r * 1.1, r * 0.34, 0.012), dark)
    mouth.position.set(0, -r * 0.42, r * 0.92)
    head.add(mouth)
    const teeth = new Mesh(new BoxGeometry(r * 0.95, r * 0.2, 0.014), white)
    teeth.position.set(0, -r * 0.42, r * 0.93)
    head.add(teeth)
    if (quirk() > 0.45) {
      const hair = new Mesh(new BoxGeometry(r * 2.05, r * 0.8, r * 1.9), dark)
      hair.position.set(0, r * 0.75, -r * 0.15)
      head.add(hair)
    }
    this.torso.add(head)

    // glowing nape weak point, matching sim napeCenter (~0.82h, behind the neck)
    const nape = new Mesh(new BoxGeometry(0.085, 0.075, 0.035), this.napeMat)
    nape.position.set(0, 0.38, -0.09)
    this.torso.add(nape)

    this.group.add(this.legL, this.legR, this.torso)
    this.group.scale.setScalar(t.height)
    this.syncPose(t, 0)
  }

  addTo(scene: Scene): void {
    scene.add(this.group)
  }

  removeFrom(scene: Scene): void {
    scene.remove(this.group)
  }

  syncPose(t: TitanState, dt: number): void {
    this.group.position.copy(t.pos)
    this.group.rotation.y = t.facing

    if (t.state === 'dead') {
      // fall forward around the feet, then dissolve
      const fall = Math.min(1, t.stateTime / 0.9)
      this.group.rotation.x = (Math.PI / 2) * easeOut(fall)
      const fade = Math.max(0, 1 - Math.max(0, t.stateTime - 1) / 2)
      for (const mat of [this.skin, this.napeMat]) mat.opacity = fade
      this.napeMat.emissiveIntensity = 0
      this.group.traverse((obj) => {
        if (obj instanceof Mesh && obj.material instanceof MeshStandardMaterial) {
          obj.material.opacity = fade
        }
      })
      this.group.visible = fade > 0.01
      return
    }

    if (t.state === 'crippled') {
      // fall to the knees: sink the body and fold the legs back
      const kneel = Math.min(1, t.stateTime / 0.6)
      const eased = 1 - (1 - kneel) * (1 - kneel)
      this.group.position.y = t.pos.y - 0.22 * t.height * eased
      this.group.rotation.x = 0.12 * eased // slight forward slump
      this.legL.rotation.x = this.legR.rotation.x = -1.4 * eased
      this.armL.rotation.x = this.armR.rotation.x = -0.35 * eased
      this.torso.rotation.x = 0.28 * eased
      this.napeMat.emissiveIntensity = 1 + Math.sin(performance.now() * 0.009) * 0.6 // scream "cut here"
      return
    }
    this.group.rotation.x = 0

    const moved = Math.hypot(t.pos.x - this.lastPos.x, t.pos.z - this.lastPos.z)
    this.lastPos = { x: t.pos.x, z: t.pos.z }
    const speed = dt > 0 ? moved / dt : 0
    this.walkPhase += speed * dt * 1.6

    const swing = Math.sin(this.walkPhase) * Math.min(0.55, speed * 0.06)
    this.legL.rotation.x = swing
    this.legR.rotation.x = -swing
    this.armL.rotation.x = -swing * 0.4
    this.armR.rotation.x = swing * 0.4
    this.torso.rotation.x = t.state === 'chase' ? 0.18 : 0.05

    if (t.state === 'attack') {
      const wind = Math.min(1, t.stateTime / SWAT_WINDUP)
      this.armR.rotation.x = -2.3 * wind + (wind >= 1 ? 1.6 : 0)
    } else if (t.state === 'leap') {
      this.legL.rotation.x = this.legR.rotation.x = 0.9
      this.armL.rotation.x = this.armR.rotation.x = -1.4
    }

    this.napeMat.emissiveIntensity = 0.65 + Math.sin(performance.now() * 0.004 + t.id) * 0.35
  }
}

function limb(
  material: MeshStandardMaterial,
  thickness: number,
  length: number,
  x: number,
  pivotY: number,
): Group {
  const pivot = new Group()
  pivot.position.set(x, pivotY, 0)
  const mesh = new Mesh(new BoxGeometry(thickness, length, thickness), material)
  mesh.position.y = -length / 2
  mesh.castShadow = true
  pivot.add(mesh)
  return pivot
}

function easeOut(x: number): number {
  return 1 - (1 - x) * (1 - x)
}

/** Keeps scene titan visuals in sync with sim titan states across waves. */
export class TitanPool {
  private visuals = new Map<number, TitanVisual>()

  constructor(private scene: Scene) {}

  sync(titans: TitanState[], dt: number): void {
    const alive = new Set<number>()
    for (const t of titans) {
      alive.add(t.id)
      let visual = this.visuals.get(t.id)
      if (!visual) {
        visual = new TitanVisual(t)
        visual.addTo(this.scene)
        this.visuals.set(t.id, visual)
      }
      visual.syncPose(t, dt)
    }
    for (const [id, visual] of this.visuals) {
      if (!alive.has(id)) {
        visual.removeFrom(this.scene)
        this.visuals.delete(id)
      }
    }
  }
}
