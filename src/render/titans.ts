import {
  BoxGeometry,
  CapsuleGeometry,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  RepeatWrapping,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  Texture,
  TextureLoader,
} from 'three'

const textureLoader = new TextureLoader()

function skinTexture(repeatX: number, repeatY: number): Texture {
  const texture = textureLoader.load('/textures/skin.jpg')
  texture.colorSpace = SRGBColorSpace
  texture.wrapS = texture.wrapT = RepeatWrapping
  texture.repeat.set(repeatX, repeatY)
  return texture
}

function hairTexture(): Texture {
  const texture = textureLoader.load('/textures/bark.jpg')
  texture.colorSpace = SRGBColorSpace
  texture.wrapS = texture.wrapT = RepeatWrapping
  texture.repeat.set(2, 2)
  return texture
}

function decalTexture(path: string): Texture {
  const texture = textureLoader.load(path)
  texture.colorSpace = SRGBColorSpace
  return texture
}
import { createRng } from '../sim/rng'
import type { TitanState } from '../sim/titan'
import { SWAT_WINDUP } from '../sim/titan'

/**
 * Procedural "pure titan": nude-look tan humanoid with a creepy grin and slightly wrong
 * proportions, per the user's reference images. Built at unit height and scaled by t.height.
 */
export interface Limb {
  pivot: Group // hip or shoulder
  lower: Group // knee or elbow
}

/** Two-segment limb with a joint sphere: capsules instead of boxes. */
export function makeLimb(
  material: MeshStandardMaterial,
  upperR: number,
  upperL: number,
  lowerR: number,
  lowerL: number,
  x: number,
  pivotY: number,
  lowerMaterial: MeshStandardMaterial = material,
): Limb {
  const pivot = new Group()
  pivot.position.set(x, pivotY, 0)
  const upper = new Mesh(new CapsuleGeometry(upperR, upperL, 3, 8), material)
  upper.position.y = -(upperL / 2 + upperR)
  upper.castShadow = true
  pivot.add(upper)
  const jointY = -(upperL + upperR * 1.7)
  const joint = new Mesh(new SphereGeometry(upperR * 1.02, 8, 6), material)
  joint.position.y = jointY
  pivot.add(joint)
  const lower = new Group()
  lower.position.y = jointY
  const lowerMesh = new Mesh(new CapsuleGeometry(lowerR, lowerL, 3, 8), lowerMaterial)
  lowerMesh.position.y = -(lowerL / 2 + lowerR)
  lowerMesh.castShadow = true
  lower.add(lowerMesh)
  const tip = new Mesh(new SphereGeometry(lowerR * 1.1, 8, 6), lowerMaterial)
  tip.position.y = -(lowerL + lowerR * 1.6)
  lower.add(tip)
  pivot.add(lower)
  return { pivot, lower }
}

class TitanVisual {
  readonly group = new Group()
  private readonly skin: MeshStandardMaterial
  private readonly napeMat: MeshStandardMaterial
  private readonly legL: Limb
  private readonly legR: Limb
  private readonly armL: Limb
  private readonly armR: Limb
  private readonly torso: Group
  /** Heel glows matching sim ankle targets; index 0 = left, 1 = right (like t.ankles). */
  private readonly ankleGlows: [Mesh, Mesh]
  private walkPhase = 0
  private lastPos = { x: 0, z: 0 }

  constructor(t: TitanState) {
    const quirk = createRng(t.id * 7919 + 17)
    // aged-leather texture reads as titan flesh; light tint jitter varies each titan
    // skin.jpg is pre-lifted to flesh tones (ffmpeg gamma); tint adds per-titan variety
    const lift = 1 + quirk() * 0.3
    const skinTone = new Color(lift * 1.05, lift, lift * 0.9)
    this.skin = new MeshStandardMaterial({
      map: skinTexture(1.5, 1.5),
      color: skinTone,
      roughness: 0.9,
      transparent: true,
    })
    const dark = new MeshStandardMaterial({
      map: hairTexture(),
      color: 0x4a3826,
      roughness: 0.9,
      transparent: true,
    })
    this.napeMat = new MeshStandardMaterial({
      color: 0xb3202a,
      emissive: 0xd42b35,
      emissiveIntensity: 0.8,
      transparent: true,
    })

    const headScale = 1 + quirk() * 0.45 // big heads read "pure titan"
    const bellyScale = 0.85 + quirk() * 0.6

    // two-segment capsule legs with hip pivots and knees
    this.legL = makeLimb(this.skin, 0.058, 0.11, 0.047, 0.1, -0.085, 0.44)
    this.legR = makeLimb(this.skin, 0.058, 0.11, 0.047, 0.1, 0.085, 0.44)

    // glowing heel tendons, the same red as the nape so both weak points read alike;
    // each hides once its ankle is cut (see syncPose)
    const heel = (limb: Limb): Mesh => {
      const glow = new Mesh(new BoxGeometry(0.06, 0.055, 0.03), this.napeMat)
      glow.position.set(0, -0.175, -0.05) // back of the lower leg, at the sim's anklePos height
      limb.lower.add(glow)
      return glow
    }
    this.ankleGlows = [heel(this.legL), heel(this.legR)]

    this.torso = new Group()
    this.torso.position.y = 0.44
    const belly = new Mesh(new CapsuleGeometry(0.125, 0.18, 4, 10), this.skin)
    belly.scale.set(bellyScale, 1, bellyScale * 0.72)
    belly.position.y = 0.17
    belly.castShadow = true
    this.torso.add(belly)
    for (const side of [-1, 1]) {
      const shoulder = new Mesh(new SphereGeometry(0.062, 8, 6), this.skin)
      shoulder.position.set(side * 0.155, 0.32, 0)
      this.torso.add(shoulder)
    }

    // arms with shoulder pivots and elbows (hang loose and creepy)
    const armLen = 0.08 + quirk() * 0.05
    this.armL = makeLimb(this.skin, 0.044, armLen, 0.037, armLen, -0.165, 0.32)
    this.armR = makeLimb(this.skin, 0.044, armLen, 0.037, armLen, 0.165, 0.32)
    this.torso.add(this.armL.pivot, this.armR.pivot)

    // head + face at the top of the torso group
    const head = new Group()
    head.position.y = 0.41
    const skull = new Mesh(new SphereGeometry(0.085 * headScale, 12, 10), this.skin)
    skull.scale.set(1, 1.15, 1)
    skull.castShadow = true
    head.add(skull)
    const r = 0.085 * headScale
    // photo-decal face: bloodshot eyes and a bared grin (CC0 sprites, see README credits)
    const eyeMat = new MeshBasicMaterial({
      map: decalTexture('/textures/eye.png'),
      transparent: true,
      alphaTest: 0.25,
    })
    for (const side of [-1, 1]) {
      const eye = new Mesh(new PlaneGeometry(r * 0.62, r * 0.6), eyeMat)
      eye.position.set(side * r * 0.4, r * 0.28, r * 0.94)
      eye.rotation.y = side * 0.18
      head.add(eye)
    }
    const mouth = new Mesh(new BoxGeometry(r * 1.05, r * 0.4, 0.012), dark)
    mouth.position.set(0, -r * 0.42, r * 0.88)
    head.add(mouth)
    const teeth = new Mesh(
      new PlaneGeometry(r * 1.25, r * 0.8),
      new MeshBasicMaterial({
        map: decalTexture('/textures/teeth.png'),
        transparent: true,
        alphaTest: 0.25,
      }),
    )
    teeth.position.set(0, -r * 0.42, r * 0.97)
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

    this.group.add(this.legL.pivot, this.legR.pivot, this.torso)
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

    // a cut tendon stops advertising itself; a crippled or dead titan has none to sell
    const showAnkles = t.state !== 'dead' && t.state !== 'crippled'
    this.ankleGlows[0].visible = showAnkles && !t.ankles[0]
    this.ankleGlows[1].visible = showAnkles && !t.ankles[1]

    if (t.state === 'dead') {
      // fall forward around the feet, then dissolve
      const fall = Math.min(1, t.stateTime / 0.9)
      this.group.rotation.x = (Math.PI / 2) * easeOut(fall)
      const fade = Math.max(0, 1 - Math.max(0, t.stateTime - 1) / 2)
      for (const mat of [this.skin, this.napeMat]) mat.opacity = fade
      this.napeMat.emissiveIntensity = 0
      this.group.traverse((obj) => {
        if (
          obj instanceof Mesh &&
          (obj.material instanceof MeshStandardMaterial || obj.material instanceof MeshBasicMaterial)
        ) {
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
      this.legL.pivot.rotation.x = this.legR.pivot.rotation.x = -1.35 * eased
      this.legL.lower.rotation.x = this.legR.lower.rotation.x = 2.1 * eased
      this.armL.pivot.rotation.x = this.armR.pivot.rotation.x = -0.35 * eased
      this.armL.lower.rotation.x = this.armR.lower.rotation.x = -0.4 * eased
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
    this.legL.pivot.rotation.x = swing
    this.legR.pivot.rotation.x = -swing
    this.legL.lower.rotation.x = Math.max(0, -swing) * 1.2 + 0.05
    this.legR.lower.rotation.x = Math.max(0, swing) * 1.2 + 0.05
    this.armL.pivot.rotation.x = -swing * 0.4
    this.armR.pivot.rotation.x = swing * 0.4
    this.armL.lower.rotation.x = -0.12 - Math.max(0, swing) * 0.3
    this.armR.lower.rotation.x = -0.12 - Math.max(0, -swing) * 0.3
    this.torso.rotation.x = t.state === 'chase' ? 0.18 : 0.05

    if (t.state === 'attack') {
      const wind = Math.min(1, t.stateTime / SWAT_WINDUP)
      this.armR.pivot.rotation.x = -2.3 * wind + (wind >= 1 ? 1.6 : 0)
      this.armR.lower.rotation.x = -0.7 * wind
    } else if (t.state === 'leap') {
      this.legL.pivot.rotation.x = this.legR.pivot.rotation.x = 0.9
      this.legL.lower.rotation.x = this.legR.lower.rotation.x = 1.3
      this.armL.pivot.rotation.x = this.armR.pivot.rotation.x = -1.4
      this.armL.lower.rotation.x = this.armR.lower.rotation.x = -0.3
    }

    this.napeMat.emissiveIntensity = 0.65 + Math.sin(performance.now() * 0.004 + t.id) * 0.35
  }
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
