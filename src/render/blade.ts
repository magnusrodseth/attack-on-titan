import {
  AdditiveBlending,
  BoxGeometry,
  Camera,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
} from 'three'

const SWEEP_TIME = 0.16
const SWEEP_FROM = 1.25
const SWEEP_TO = -1.55
const REST_POS = { x: 0.42, y: -0.52, z: -0.75 }
const REST_ANGLE = -0.5
const SLASH_POS = { x: 0, y: -0.42, z: -0.85 }

/**
 * First-person ODM blade viewmodel: rests at the lower right, and on slash sweeps
 * across the screen like a windshield wiper with an additive arc trail. Drawn with
 * depthTest off so it never clips into nearby buildings.
 */
export class BladeView {
  private root = new Group()
  private pivot = new Group()
  private trailMat: MeshBasicMaterial
  private trail: Mesh
  private t = 1
  private side = 1

  constructor(camera: Camera) {
    camera.add(this.root)
    this.root.position.set(REST_POS.x, REST_POS.y, REST_POS.z)

    const bladeMat = new MeshBasicMaterial({ color: 0xdde7ee, depthTest: false })
    const blade = new Mesh(new BoxGeometry(0.013, 0.52, 0.006), bladeMat)
    blade.position.y = 0.3
    blade.renderOrder = 999
    const edge = new Mesh(new BoxGeometry(0.004, 0.52, 0.009), new MeshBasicMaterial({ color: 0xffffff, depthTest: false }))
    edge.position.set(0.008, 0.3, 0)
    edge.renderOrder = 999
    const grip = new Mesh(
      new BoxGeometry(0.024, 0.11, 0.024),
      new MeshBasicMaterial({ color: 0x2a2622, depthTest: false }),
    )
    grip.position.y = -0.015
    grip.renderOrder = 999
    this.pivot.add(blade, edge, grip)
    this.pivot.rotation.z = REST_ANGLE

    this.trailMat = new MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      side: DoubleSide,
      depthTest: false,
      depthWrite: false,
      blending: AdditiveBlending,
    })
    this.trail = new Mesh(
      new RingGeometry(0.16, 0.58, 32, 1, SWEEP_TO + Math.PI / 2, SWEEP_FROM - SWEEP_TO),
      this.trailMat,
    )
    this.trail.renderOrder = 998

    this.root.add(this.pivot, this.trail)
  }

  slash(): void {
    this.t = 0
    this.side *= -1
    this.trail.scale.x = this.side
  }

  update(dt: number): void {
    if (this.t < 1) {
      this.t = Math.min(1, this.t + dt / SWEEP_TIME)
      const eased = this.t * this.t * (3 - 2 * this.t) // smoothstep: fast through the middle
      this.pivot.rotation.z = this.side * (SWEEP_FROM + (SWEEP_TO - SWEEP_FROM) * eased)
      this.root.position.set(SLASH_POS.x, SLASH_POS.y, SLASH_POS.z)
      this.trailMat.opacity = (1 - this.t) * 0.28
      return
    }
    this.trailMat.opacity = Math.max(0, this.trailMat.opacity - dt * 4)
    const k = Math.min(1, dt * 9)
    this.root.position.x += (REST_POS.x - this.root.position.x) * k
    this.root.position.y += (REST_POS.y - this.root.position.y) * k
    this.root.position.z += (REST_POS.z - this.root.position.z) * k
    this.pivot.rotation.z += (REST_ANGLE - this.pivot.rotation.z) * k
  }
}
