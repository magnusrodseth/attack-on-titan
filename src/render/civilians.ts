import {
  BufferGeometry,
  Color,
  CylinderGeometry,
  DynamicDrawUsage,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  RepeatWrapping,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { Civilian } from '../sim/folk'

/**
 * The crowd, built the way the Shifters are built.
 *
 * The titans are procedural bodies of tapered chains and metaball-ish spheres
 * (`src/render/titans/lib.ts`, `chain()`), and the townsfolk had no business standing next to
 * them as boxes. These use the same primitives — a tapering torso, chained limbs with elbows
 * and knees, a rounded skull — with the one difference that is the whole point: the titans'
 * proportions are *wrong* on purpose, and these are right. Same toolkit, opposite register.
 *
 * The cost problem the Shifters do not have: there are sixty of these. So each part is authored
 * ONCE as a merged geometry with its pivot at the joint, and the district draws as seven
 * InstancedMeshes — head, hair, torso, two arms, two legs — posed per person with one matrix
 * each. Sixty people, seven draw calls.
 *
 * Textures (CC0, credited in the README): a real human-skin macro for the skull, ambientCG
 * wool and canvas for the clothes, leather for hair and boots — tinted per person with
 * instanceColor so a crowd reads as a crowd. Deliberately NOT `skin.jpg`, the brown leather
 * that gives the titans their cursed flesh. These are people.
 */

const MAX_FOLK = 96

// The body, in metres, standing on the origin: 1.72 m to the crown.
const HIP_Y = 0.9
const SHOULDER_Y = 1.4
const HEAD_Y = 1.6

const loader = new TextureLoader()

function sourced(url: string, repeat: number, rough = 0.85): MeshStandardMaterial {
  const map = loader.load(url)
  map.colorSpace = SRGBColorSpace
  map.wrapS = map.wrapT = RepeatWrapping
  map.repeat.set(repeat, repeat)
  return new MeshStandardMaterial({ map, roughness: rough, metalness: 0 })
}

/**
 * `chain()` from the titan toolkit, as geometry rather than meshes: a tapered cylinder from a
 * to b with sphere caps, merged into one buffer so it can be instanced. This is the metaball
 * stand-in the Shifters are made of, and it is the reason a civilian's arm reads as an arm
 * rather than as a stick.
 */
function chainGeo(a: Vector3, b: Vector3, r0: number, r1: number, radial = 8): BufferGeometry {
  const dir = b.clone().sub(a)
  const len = dir.length()
  const cyl = new CylinderGeometry(r1, r0, len, radial, 1, true)
  const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir.clone().normalize())
  cyl.applyQuaternion(q)
  const mid = a.clone().addScaledVector(dir, 0.5)
  cyl.translate(mid.x, mid.y, mid.z)
  const capA = new SphereGeometry(r0, radial, 6)
  capA.translate(a.x, a.y, a.z)
  const capB = new SphereGeometry(r1, radial, 6)
  capB.translate(b.x, b.y, b.z)
  return mergeGeometries([cyl, capA, capB], false)!
}

/** Torso: hips to shoulders, widening into a chest. Pivot at the hips. */
function torsoGeo(): BufferGeometry {
  const spine = chainGeo(new Vector3(0, 0, 0), new Vector3(0, SHOULDER_Y - HIP_Y, 0), 0.14, 0.17, 10)
  const chest = new SphereGeometry(0.17, 10, 8)
  chest.scale(1.15, 0.9, 0.72)
  chest.translate(0, SHOULDER_Y - HIP_Y - 0.09, 0)
  const neck = new SphereGeometry(0.055, 8, 6)
  neck.translate(0, SHOULDER_Y - HIP_Y + 0.06, 0)
  return mergeGeometries([spine, chest, neck], false)!
}

/** An arm hanging from its shoulder joint: upper arm, elbow, forearm, hand. */
function armGeo(side: -1 | 1): BufferGeometry {
  const shoulder = new Vector3(0, 0, 0)
  const elbow = new Vector3(side * 0.04, -0.26, 0.01)
  const wrist = new Vector3(side * 0.06, -0.5, 0.03)
  const upper = chainGeo(shoulder, elbow, 0.062, 0.05)
  const fore = chainGeo(elbow, wrist, 0.05, 0.042)
  const hand = new SphereGeometry(0.05, 8, 6)
  hand.scale(0.9, 1.1, 0.7)
  hand.translate(wrist.x, wrist.y - 0.04, wrist.z)
  return mergeGeometries([upper, fore, hand], false)!
}

/** A leg hanging from the hip joint: thigh, knee, calf, boot. */
function legGeo(side: -1 | 1): BufferGeometry {
  const hip = new Vector3(side * 0.085, 0, 0)
  const knee = new Vector3(side * 0.075, -0.44, 0.01)
  const ankle = new Vector3(side * 0.07, -0.84, 0)
  const thigh = chainGeo(hip, knee, 0.095, 0.07)
  const calf = chainGeo(knee, ankle, 0.07, 0.05)
  const boot = new SphereGeometry(0.06, 8, 6)
  boot.scale(1, 0.7, 1.7)
  boot.translate(ankle.x, ankle.y - 0.02, ankle.z + 0.03)
  return mergeGeometries([thigh, calf, boot], false)!
}

function headGeo(): BufferGeometry {
  const skull = new SphereGeometry(0.105, 12, 10)
  skull.scale(0.95, 1.12, 1)
  const nose = new SphereGeometry(0.028, 6, 5)
  nose.translate(0, -0.01, 0.1)
  return mergeGeometries([skull, nose], false)!
}

function hairGeo(): BufferGeometry {
  const cap = new SphereGeometry(0.112, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.62)
  cap.scale(1, 1.05, 1.02)
  cap.translate(0, 0.012, -0.006)
  return cap
}

/** Drab, earthy, period — and LIGHT, because their worst moment is in a titan's shadow. */
const CLOTH_TINTS = [0xc9b79a, 0xb8a684, 0xd6c3a4, 0xa89a80, 0xc7a878, 0xb59c82, 0xd8d2c0, 0xa2907a]
const LEG_TINTS = [0x8a7c68, 0x9b8b74, 0x7d7263, 0xa08c72]
const HAIR_TINTS = [0x3a2c21, 0x5a4530, 0x7a6247, 0x241c16, 0x8d7350]
const SKIN_TINTS = [0xffffff, 0xf0dcc8, 0xdcc0a4, 0xc79f7c, 0xa87c58]

export class CivilianPool {
  private head: InstancedMesh
  private hair: InstancedMesh
  private torso: InstancedMesh
  private armL: InstancedMesh
  private armR: InstancedMesh
  private legL: InstancedMesh
  private legR: InstancedMesh
  private all: InstancedMesh[]

  private readonly m = new Matrix4()
  private readonly rot = new Quaternion()
  private readonly at = new Vector3()
  private readonly one = new Vector3(1, 1, 1)
  private readonly bigger = new Vector3(1, 1, 1)
  private readonly up = new Vector3(0, 1, 0)
  private readonly right = new Vector3(1, 0, 0)
  private readonly fwd = new Vector3(0, 0, 1)
  private time = 0

  constructor(scene: Scene) {
    const skin = sourced('/textures/civilian_skin.jpg', 1, 0.72)
    const wool = sourced('/textures/wool.jpg', 2)
    const canvas = sourced('/textures/canvas.jpg', 2)
    const leather = sourced('/textures/leather.jpg', 2, 0.7)

    this.head = new InstancedMesh(headGeo(), skin, MAX_FOLK)
    this.hair = new InstancedMesh(hairGeo(), leather, MAX_FOLK)
    this.torso = new InstancedMesh(torsoGeo(), wool, MAX_FOLK)
    this.armL = new InstancedMesh(armGeo(-1), wool, MAX_FOLK)
    this.armR = new InstancedMesh(armGeo(1), wool, MAX_FOLK)
    this.legL = new InstancedMesh(legGeo(-1), canvas, MAX_FOLK)
    this.legR = new InstancedMesh(legGeo(1), canvas, MAX_FOLK)

    this.all = [this.head, this.hair, this.torso, this.armL, this.armR, this.legL, this.legR]
    for (const mesh of this.all) {
      mesh.castShadow = true
      mesh.instanceMatrix.setUsage(DynamicDrawUsage)
      mesh.count = 0
      mesh.frustumCulled = false
      scene.add(mesh)
    }

    const tint = new Color()
    for (let i = 0; i < MAX_FOLK; i++) {
      const cloth = CLOTH_TINTS[i % CLOTH_TINTS.length]!
      const leg = LEG_TINTS[i % LEG_TINTS.length]!
      this.torso.setColorAt(i, tint.setHex(cloth))
      this.armL.setColorAt(i, tint.setHex(cloth))
      this.armR.setColorAt(i, tint.setHex(cloth))
      this.legL.setColorAt(i, tint.setHex(leg))
      this.legR.setColorAt(i, tint.setHex(leg))
      this.hair.setColorAt(i, tint.setHex(HAIR_TINTS[i % HAIR_TINTS.length]!))
      this.head.setColorAt(i, tint.setHex(SKIN_TINTS[i % SKIN_TINTS.length]!))
    }
    for (const mesh of this.all) if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }

  /** Places one part at a joint given in body-local metres, under the body's own rotation. */
  private place(
    mesh: InstancedMesh,
    i: number,
    root: Vector3,
    body: Quaternion,
    lx: number,
    ly: number,
    lz: number,
    limb: Quaternion | null,
    scale: Vector3,
  ): void {
    this.at.set(lx, ly, lz).multiplyScalar(scale.x).applyQuaternion(body).add(root)
    const q = limb ? body.clone().multiply(limb) : body
    mesh.setMatrixAt(i, this.m.compose(this.at, q, scale))
  }

  sync(folk: Civilian[], dt: number): void {
    this.time += dt
    let n = 0
    const root = new Vector3()
    for (const c of folk) {
      if (n >= MAX_FOLK) break
      if (c.state === 'safe') continue // indoors, off the streets, alive

      const held = c.state === 'held'
      const dead = c.state === 'dead'
      const running = c.state === 'flee' || c.state === 'delivering'

      const cadence = running ? 9.5 : 3.2
      const phase = this.time * cadence + c.id * 1.7
      const stride = dead || held ? 0 : Math.sin(phase) * (running ? 0.75 : 0.26)
      const bob = dead || held ? 0 : Math.abs(Math.sin(phase)) * (running ? 0.05 : 0.02)

      this.rot.setFromAxisAngle(this.up, c.facing)
      let scale = this.one
      if (dead) {
        // face down in the street, and they stay there: an emptying district is visible from
        // the air as the bodies it is leaving behind
        this.rot.multiply(new Quaternion().setFromAxisAngle(this.right, Math.PI / 2))
        root.set(c.pos.x, c.pos.y + 0.14, c.pos.z)
      } else if (held) {
        // hauled up and kicking, tipped back, and scaled: a real 1.7 m human at a titan's mouth
        // is twenty pixels of screen, which is not a thing anybody can act on. The one
        // deliberate lie in the whole system, and it buys the window its readability.
        this.rot.multiply(new Quaternion().setFromAxisAngle(this.right, -0.45))
        scale = this.bigger.set(1.55, 1.55, 1.55)
        root.set(c.pos.x, c.pos.y - 1.05, c.pos.z)
      } else {
        root.set(c.pos.x, c.pos.y + bob, c.pos.z)
      }
      const body = this.rot.clone()

      // legs: a stride at a run, a hard kick in a fist (nobody goes quietly)
      const kick = held ? Math.sin(this.time * 12 + c.id) * 0.8 : stride
      this.place(this.legL, n, root, body, 0, HIP_Y, 0, new Quaternion().setFromAxisAngle(this.right, kick), scale)
      this.place(this.legR, n, root, body, 0, HIP_Y, 0, new Quaternion().setFromAxisAngle(this.right, -kick), scale)

      // arms: counter-swinging at a run; thrown up and out in a fist
      const armL = held
        ? new Quaternion().setFromAxisAngle(this.fwd, 2.1 + Math.sin(this.time * 9) * 0.3)
        : new Quaternion().setFromAxisAngle(this.right, -stride * 0.8)
      const armR = held
        ? new Quaternion().setFromAxisAngle(this.fwd, -2.1 - Math.sin(this.time * 9 + 1) * 0.3)
        : new Quaternion().setFromAxisAngle(this.right, stride * 0.8)
      this.place(this.armL, n, root, body, -0.17, SHOULDER_Y, 0, armL, scale)
      this.place(this.armR, n, root, body, 0.17, SHOULDER_Y, 0, armR, scale)

      this.place(this.torso, n, root, body, 0, HIP_Y, 0, null, scale)
      this.place(this.head, n, root, body, 0, HEAD_Y, 0, null, scale)
      this.place(this.hair, n, root, body, 0, HEAD_Y + 0.03, 0, null, scale)

      n++
    }
    for (const mesh of this.all) {
      mesh.count = n
      mesh.instanceMatrix.needsUpdate = true
    }
  }

  clear(): void {
    for (const mesh of this.all) mesh.count = 0
  }
}
