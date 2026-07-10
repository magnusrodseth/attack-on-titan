import type { Scene, Vector3 } from 'three'
import { CylinderGeometry, Group, Mesh, MeshBasicMaterial, SphereGeometry } from 'three'
import { ankleHitRadius, bodyHitRadius, napeAimOk, napeHitRadius } from '../sim/combat'
import type { TitanState } from '../sim/titan'
import { anklePos, bodyCenter, hookBody, napeCenter } from '../sim/titan'

/**
 * Dev-only overlay drawing the sim's true hit volumes over the rendered flesh: the three
 * slash spheres trySlash tests (nape and ankles compete by normalized distance, body is
 * the fallback) plus the body cylinder hooks anchor to. Radii and the nape aim gate come
 * from the exported combat/titan helpers, so the outlines cannot drift from the code that
 * judges a hit: the nape wireframe dims whenever the player's aim leaves its cone.
 * Wireframes skip the depth test on purpose — a volume buried in flesh still has to read.
 */

interface Rig {
  root: Group
  nape: Mesh
  body: Mesh
  ankles: [Mesh, Mesh]
  hook: Mesh
}

function wire(color: number, opacity: number): MeshBasicMaterial {
  return new MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity, depthTest: false })
}

export class TitanHitboxes {
  private rigs: Rig[] = []
  private sphere = new SphereGeometry(1, 20, 14)
  // few radial segments: a tall thin wireframe cylinder at 24 buries the flesh behind it
  private cylinder = new CylinderGeometry(1, 1, 1, 10, 1, true)
  private mats = {
    nape: wire(0xff4b5c, 0.55),
    napeGated: wire(0xff4b5c, 0.12), // aim outside the cone: the volume is there but not live
    ankle: wire(0xffb347, 0.5),
    body: wire(0x4ba7ff, 0.16), // the body sphere is huge; keep it a whisper
    hook: wire(0x58e07c, 0.25),
  }
  private visible = false

  constructor(private scene: Scene) {}

  setVisible(visible: boolean): void {
    this.visible = visible
    if (!visible) for (const rig of this.rigs) rig.root.visible = false
  }

  /** Call every frame; positions, radii and the aim gate track the live sim state. */
  sync(titans: TitanState[], slashRange: number, eye: Vector3, aim: Vector3): void {
    if (!this.visible) return
    let used = 0
    for (const t of titans) {
      if (t.hp <= 0) continue // every sim hit loop skips dead titans
      const rig = this.rigs[used] ?? this.grow()
      used++
      rig.root.visible = true
      rig.nape.material = napeAimOk(eye, aim, t, slashRange) ? this.mats.nape : this.mats.napeGated
      rig.nape.position.copy(napeCenter(t))
      rig.nape.scale.setScalar(napeHitRadius(slashRange, t))
      rig.body.position.copy(bodyCenter(t))
      rig.body.scale.setScalar(bodyHitRadius(slashRange, t))
      for (const side of [0, 1] as const) {
        // the sim refuses ankle cuts on crippled titans and already-severed tendons
        const live = t.state !== 'crippled' && !t.ankles[side]
        rig.ankles[side].visible = live
        if (live) {
          rig.ankles[side].position.copy(anklePos(t, side))
          rig.ankles[side].scale.setScalar(ankleHitRadius(slashRange, t))
        }
      }
      const { radius, top } = hookBody(t)
      rig.hook.position.set(t.pos.x, t.pos.y + top / 2, t.pos.z)
      rig.hook.scale.set(radius, top, radius)
    }
    for (let i = used; i < this.rigs.length; i++) this.rigs[i]!.root.visible = false
  }

  private grow(): Rig {
    const root = new Group()
    const make = (geo: SphereGeometry | CylinderGeometry, mat: MeshBasicMaterial): Mesh => {
      const mesh = new Mesh(geo, mat)
      mesh.renderOrder = 999 // after the flesh, or depthTest:false still loses the blend order
      root.add(mesh)
      return mesh
    }
    const rig: Rig = {
      root,
      nape: make(this.sphere, this.mats.nape),
      body: make(this.sphere, this.mats.body),
      ankles: [make(this.sphere, this.mats.ankle), make(this.sphere, this.mats.ankle)],
      hook: make(this.cylinder, this.mats.hook),
    }
    this.scene.add(root)
    this.rigs.push(rig)
    return rig
  }

  dispose(): void {
    for (const rig of this.rigs) this.scene.remove(rig.root)
    this.rigs.length = 0
    this.sphere.dispose()
    this.cylinder.dispose()
    for (const mat of Object.values(this.mats)) mat.dispose()
  }
}
