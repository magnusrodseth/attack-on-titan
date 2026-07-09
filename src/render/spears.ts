import {
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  RepeatWrapping,
  RingGeometry,
  Scene,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
} from 'three'
import type { SpearPickup, SpearState } from '../sim/spear'
import { SPEAR_FUSE } from '../sim/spear'

const UP = new Vector3(0, 1, 0)

/**
 * Thunder spears and their street caches. Both meshes are hand-built from the
 * already-credited brushed-steel and cable-metal textures (see README credits);
 * the warhead's beeping glow and the cache's amber column are gameplay indicator
 * glows, the accepted exception to the sourced-texture rule.
 */
export class SpearsView {
  private steelMat: MeshStandardMaterial
  private darkMat: MeshStandardMaterial
  private spears = new Map<number, { group: Group; warhead: MeshStandardMaterial }>()
  private racks: { group: Group; glow: MeshBasicMaterial }[] = []
  private lastPickups: SpearPickup[] | null = null
  private time = 0

  constructor(private scene: Scene) {
    const steel = new TextureLoader().load('/textures/blade-steel.jpg')
    steel.colorSpace = SRGBColorSpace
    steel.wrapS = steel.wrapT = RepeatWrapping
    this.steelMat = new MeshStandardMaterial({
      map: steel,
      color: 0xb8bcc2,
      metalness: 0.6,
      roughness: 0.45,
    })
    const dark = new TextureLoader().load('/textures/metal.jpg')
    dark.colorSpace = SRGBColorSpace
    dark.wrapS = dark.wrapT = RepeatWrapping
    this.darkMat = new MeshStandardMaterial({
      map: dark,
      color: 0x5a5148,
      metalness: 0.55,
      roughness: 0.6,
    })
  }

  /** Long thin tube, conical warhead, flared thruster skirt — the reference silhouette. */
  private makeSpear(): { group: Group; warhead: MeshStandardMaterial } {
    const group = new Group()
    const body = new Mesh(new CylinderGeometry(0.055, 0.055, 1.5, 8), this.steelMat)
    group.add(body)
    // the warhead gets its own material instance so the fuse can pulse it red
    const warheadMat = this.darkMat.clone()
    const warhead = new Mesh(new ConeGeometry(0.13, 0.5, 8), warheadMat)
    warhead.position.y = 0.95
    group.add(warhead)
    const collar = new Mesh(new CylinderGeometry(0.085, 0.085, 0.16, 8), this.darkMat)
    collar.position.y = 0.68
    group.add(collar)
    const skirt = new Mesh(new CylinderGeometry(0.075, 0.12, 0.24, 8), this.darkMat)
    skirt.position.y = -0.82
    group.add(skirt)
    group.traverse((o) => {
      if (o instanceof Mesh) o.frustumCulled = false
    })
    this.scene.add(group)
    return { group, warhead: warheadMat }
  }

  /** A low steel frame holding three upright spears under an amber locator column. */
  private makeRack(x: number, z: number): { group: Group; glow: MeshBasicMaterial } {
    const group = new Group()
    const frame = new Mesh(new CylinderGeometry(0.75, 0.85, 0.35, 10), this.darkMat)
    frame.position.y = 0.18
    group.add(frame)
    for (let i = 0; i < 3; i++) {
      const angle = (i / 3) * Math.PI * 2
      const { group: spear } = this.makeSpear()
      this.scene.remove(spear) // it belongs to the rack, not the loose-spear pool
      spear.position.set(Math.cos(angle) * 0.32, 1.1, Math.sin(angle) * 0.32)
      spear.rotation.z = 0.08 * Math.cos(angle)
      group.add(spear)
    }
    const glowMat = new MeshBasicMaterial({
      color: 0xffb347,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
    })
    const column = new Mesh(new CylinderGeometry(0.9, 0.9, 7, 12, 1, true), glowMat)
    column.position.y = 3.5
    group.add(column)
    const ring = new Mesh(
      new RingGeometry(1.1, 1.5, 24).rotateX(-Math.PI / 2),
      new MeshStandardMaterial({
        color: 0xffb347,
        emissive: 0xffb347,
        emissiveIntensity: 0.8,
        transparent: true,
        opacity: 0.55,
      }),
    )
    ring.position.y = 0.06
    group.add(ring)
    group.position.set(x, 0, z)
    this.scene.add(group)
    return { group, glow: glowMat }
  }

  sync(spears: SpearState[], pickups: SpearPickup[], dt: number): void {
    this.time += dt

    // loose spears: flying or stuck-and-beeping
    const seen = new Set<number>()
    for (const spear of spears) {
      seen.add(spear.id)
      let view = this.spears.get(spear.id)
      if (!view) {
        view = this.makeSpear()
        this.spears.set(spear.id, view)
      }
      view.group.position.copy(spear.pos)
      // vel keeps the flight direction even after sticking: orientation stays embedded
      if (spear.vel.lengthSq() > 1e-6) {
        view.group.quaternion.setFromUnitVectors(UP, spear.vel.clone().normalize())
      }
      if (spear.phase === 'stuck') {
        const urgency = 1 - Math.max(0, spear.fuse) / SPEAR_FUSE
        const flicker = 0.5 + 0.5 * Math.sin(this.time * (6 + urgency * 22))
        view.warhead.emissive.setHex(0xff2a1e)
        view.warhead.emissiveIntensity = 0.3 + urgency * 1.6 * flicker
      } else {
        view.warhead.emissiveIntensity = 0
      }
    }
    for (const [id, view] of this.spears) {
      if (seen.has(id)) continue
      this.scene.remove(view.group)
      this.spears.delete(id)
    }

    // caches: rebuilt when the wave replaces the array, hidden as they are taken
    if (pickups !== this.lastPickups) {
      for (const rack of this.racks) this.scene.remove(rack.group)
      this.racks = pickups.map((pk) => this.makeRack(pk.x, pk.z))
      this.lastPickups = pickups
    }
    for (const [index, pickup] of pickups.entries()) {
      const rack = this.racks[index]
      if (!rack) continue
      rack.group.visible = !pickup.taken
      rack.glow.opacity = 0.12 + 0.06 * Math.sin(this.time * 2.2 + index)
    }
  }
}
