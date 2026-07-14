import {
  BoxGeometry,
  Color,
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
import type { Civilian } from '../sim/folk'

/**
 * The crowd.
 *
 * Low-poly instanced bodies, four InstancedMeshes for the whole district (head, torso, legs,
 * arms), so sixty-odd people cost four draw calls. The silhouette is doing all the work here:
 * you read a civilian from sixty metres up by their *shape*, and the one shape that has to be
 * unmistakable is a person **lifted off the ground in a fist**, because that shape is a clock
 * running down.
 *
 * Textures (CC0, sourced — see README credits): a real human-skin macro from Wikimedia for
 * faces and hands, and neutral ambientCG fabrics for clothing, tinted per person with
 * instanceColor so a crowd looks like a crowd rather than sixty copies. Deliberately NOT the
 * `skin.jpg` leather that gives the titans their cursed, uncanny register — these are people.
 */

const MAX_FOLK = 96

const loader = new TextureLoader()

function sourced(url: string, repeat: number): MeshStandardMaterial {
  const map = loader.load(url)
  map.colorSpace = SRGBColorSpace
  map.wrapS = map.wrapT = RepeatWrapping
  map.repeat.set(repeat, repeat)
  return new MeshStandardMaterial({ map, roughness: 0.85, metalness: 0 })
}

/** The clothing palette: earthy, drab, period. A district of bakers, not of adventurers. */
const CLOTH_TINTS = [
  0x8f7f6a, 0x6f6552, 0xa08b6e, 0x5e5a4e, 0x94764f, 0x7d6b58, 0xa9a290, 0x6b5d4a,
]
const LEG_TINTS = [0x4a4238, 0x5b5044, 0x3f3a33, 0x6a5c4a]

export class CivilianPool {
  private head: InstancedMesh
  private torso: InstancedMesh
  private legs: InstancedMesh
  private arms: InstancedMesh
  private all: InstancedMesh[]
  private readonly m = new Matrix4()
  private readonly q = new Quaternion()
  private readonly pos = new Vector3()
  private readonly scale = new Vector3(1, 1, 1)
  private readonly up = new Vector3(0, 1, 0)
  private readonly tilt = new Vector3(1, 0, 0)
  private time = 0

  constructor(scene: Scene) {
    const skin = sourced('/textures/civilian_skin.jpg', 1)
    const wool = sourced('/textures/wool.jpg', 2)
    const canvas = sourced('/textures/canvas.jpg', 2)

    this.head = new InstancedMesh(new SphereGeometry(0.13, 8, 6), skin, MAX_FOLK)
    this.torso = new InstancedMesh(new BoxGeometry(0.34, 0.55, 0.2), wool, MAX_FOLK)
    this.legs = new InstancedMesh(new BoxGeometry(0.28, 0.8, 0.18), canvas, MAX_FOLK)
    this.arms = new InstancedMesh(new BoxGeometry(0.52, 0.12, 0.12), wool, MAX_FOLK)

    this.all = [this.head, this.torso, this.legs, this.arms]
    for (const mesh of this.all) {
      mesh.castShadow = true
      mesh.instanceMatrix.setUsage(DynamicDrawUsage)
      mesh.count = 0
      mesh.frustumCulled = false
      scene.add(mesh)
    }

    // per-person tints over the sourced weave: a crowd, not sixty of the same person
    const tint = new Color()
    for (let i = 0; i < MAX_FOLK; i++) {
      this.torso.setColorAt(i, tint.setHex(CLOTH_TINTS[i % CLOTH_TINTS.length]!))
      this.arms.setColorAt(i, tint.setHex(CLOTH_TINTS[i % CLOTH_TINTS.length]!))
      this.legs.setColorAt(i, tint.setHex(LEG_TINTS[i % LEG_TINTS.length]!))
      this.head.setColorAt(i, tint.setHex(0xffffff))
    }
    for (const mesh of this.all) if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }

  /**
   * Redraws the district. `folk` comes straight from the sim (solo) or the co-op mirror; the
   * pool never keeps its own state, so a snapshot and a local sim look identical.
   */
  sync(folk: Civilian[], dt: number): void {
    this.time += dt
    let n = 0
    for (const c of folk) {
      if (n >= MAX_FOLK) break
      if (c.state === 'safe') continue // indoors, off the streets, alive

      const held = c.state === 'held'
      const dead = c.state === 'dead'
      const running = c.state === 'flee' || c.state === 'delivering'

      // a gait: a small bob and a lean, faster when they are running for their life
      const cadence = running ? 9 : 3.4
      const phase = this.time * cadence + c.id * 1.7
      const bob = dead || held ? 0 : Math.abs(Math.sin(phase)) * (running ? 0.07 : 0.03)
      const swing = dead || held ? 0 : Math.sin(phase) * (running ? 0.5 : 0.18)

      this.q.setFromAxisAngle(this.up, c.facing)
      if (dead) {
        // face down in the street, and they stay there. an emptying district is visible from
        // the air as the bodies it is leaving behind.
        this.q.multiply(new Quaternion().setFromAxisAngle(this.tilt, Math.PI / 2))
      } else if (held) {
        // dangling head-down in the fist: the one silhouette that has to read instantly,
        // because it is the only one with a clock on it
        this.q.multiply(new Quaternion().setFromAxisAngle(this.tilt, Math.PI * 0.82))
      }

      const base = dead ? 0.12 : held ? 0 : bob
      // head
      this.pos.set(c.pos.x, c.pos.y + base + (held ? -0.35 : dead ? 0.18 : 1.62), c.pos.z)
      this.head.setMatrixAt(n, this.m.compose(this.pos, this.q, this.scale))
      // torso
      this.pos.set(c.pos.x, c.pos.y + base + (held ? 0.05 : dead ? 0.16 : 1.2), c.pos.z)
      this.torso.setMatrixAt(n, this.m.compose(this.pos, this.q, this.scale))
      // legs, kicking when they are held (they are not going quietly)
      const kick = held ? new Quaternion().setFromAxisAngle(this.tilt, Math.sin(this.time * 14) * 0.35) : null
      this.pos.set(c.pos.x, c.pos.y + base + (held ? 0.62 : dead ? 0.14 : 0.42), c.pos.z)
      this.legs.setMatrixAt(
        n,
        this.m.compose(this.pos, kick ? this.q.clone().multiply(kick) : this.q, this.scale),
      )
      // arms: up and out when they run, thrown up when they are lifted
      const armSwing = new Quaternion().setFromAxisAngle(
        new Vector3(0, 0, 1),
        held ? -1.15 : swing * 0.6,
      )
      this.pos.set(c.pos.x, c.pos.y + base + (held ? -0.1 : dead ? 0.16 : 1.32), c.pos.z)
      this.arms.setMatrixAt(n, this.m.compose(this.pos, this.q.clone().multiply(armSwing), this.scale))

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
