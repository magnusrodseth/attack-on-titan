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

/**
 * The clothing palette: earthy, drab, period — a district of bakers, not of adventurers. Kept
 * deliberately LIGHT, because these bodies spend their most important moments in the shadow of
 * a titan's face, and a dark tint there crushes to an unreadable black lump.
 */
const CLOTH_TINTS = [
  0xc9b79a, 0xb8a684, 0xd6c3a4, 0xa89a80, 0xc7a878, 0xb59c82, 0xd8d2c0, 0xa2907a,
]
const LEG_TINTS = [0x8a7c68, 0x9b8b74, 0x7d7263, 0xa08c72]

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
        // face down in the street, and they stay there. An emptying district is visible from
        // the air as the bodies it is leaving behind.
        this.q.multiply(new Quaternion().setFromAxisAngle(this.tilt, Math.PI / 2))
      } else if (held) {
        // held ALOFT and kicking, not dangling head-down: a body inverted in a titan's hand
        // reads as a speck clipping through its face, and this silhouette has to be legible in
        // one glance from sixty metres. Lean them back, kick the legs, throw the arms up.
        this.q.multiply(new Quaternion().setFromAxisAngle(this.tilt, -0.4))
      }
      // and scale them up a touch in the fist: at a titan's mouth a real 1.7 m human is 20 px
      // of screen, which is not a thing anyone can act on. This is a readability lie and it is
      // the only one in here.
      const s = held ? 1.6 : 1
      this.scale.set(s, s, s)

      const base = dead ? 0.12 : held ? 0 : bob
      // head
      this.pos.set(c.pos.x, c.pos.y + base + (held ? 0.62 : dead ? 0.18 : 1.62), c.pos.z)
      this.head.setMatrixAt(n, this.m.compose(this.pos, this.q, this.scale))
      // torso
      this.pos.set(c.pos.x, c.pos.y + base + (held ? 0.18 : dead ? 0.16 : 1.2), c.pos.z)
      this.torso.setMatrixAt(n, this.m.compose(this.pos, this.q, this.scale))
      // legs, kicking hard when a fist has them (nobody goes quietly)
      const kick = held
        ? new Quaternion().setFromAxisAngle(this.tilt, Math.sin(this.time * 13) * 0.55)
        : null
      this.pos.set(c.pos.x, c.pos.y + base + (held ? -0.5 : dead ? 0.14 : 0.42), c.pos.z)
      this.legs.setMatrixAt(
        n,
        this.m.compose(this.pos, kick ? this.q.clone().multiply(kick) : this.q, this.scale),
      )
      // arms: swinging when they run, thrown up when they are lifted
      const armSwing = new Quaternion().setFromAxisAngle(
        new Vector3(0, 0, 1),
        held ? -1.25 + Math.sin(this.time * 11) * 0.25 : swing * 0.6,
      )
      this.pos.set(c.pos.x, c.pos.y + base + (held ? 0.45 : dead ? 0.16 : 1.32), c.pos.z)
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
