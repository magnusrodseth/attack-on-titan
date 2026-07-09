import {
  AdditiveBlending,
  BoxGeometry,
  Camera,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  RepeatWrapping,
  RingGeometry,
  Shape,
  SRGBColorSpace,
  TextureLoader,
} from 'three'

const textureLoader = new TextureLoader()

function metalTexture(repeatY: number) {
  const texture = textureLoader.load('/textures/metal.jpg')
  texture.colorSpace = SRGBColorSpace
  texture.wrapS = texture.wrapT = RepeatWrapping
  texture.repeat.set(0.2, repeatY)
  return texture
}

/** Brushed machined steel (ambientCG Metal012, CC0) with the grain run along the blade. */
function steelTexture() {
  const texture = textureLoader.load('/textures/blade-steel.jpg')
  texture.colorSpace = SRGBColorSpace
  texture.wrapS = texture.wrapT = RepeatWrapping
  texture.center.set(0.5, 0.5)
  texture.rotation = Math.PI / 2
  texture.repeat.set(22, 1.6)
  return texture
}

/**
 * The ODM blade silhouette: a long thin single-edged bar (box-cutter profile) with a
 * diagonally clipped tip and three replacement notches along the spine. Drawn in the
 * pivot's XY plane (y = along the blade) and extruded to its thickness.
 */
function bladeGeometry() {
  const spine = -0.017
  const edge = 0.017
  const shape = new Shape()
  shape.moveTo(spine, 0.04)
  shape.lineTo(edge, 0.04)
  shape.lineTo(edge, 0.56) // the cutting edge runs the full length
  shape.lineTo(spine, 0.5) // diagonal tip clip back to the spine
  for (const notch of [0.44, 0.32, 0.2]) {
    shape.lineTo(spine, notch)
    shape.lineTo(spine + 0.007, notch - 0.01)
    shape.lineTo(spine, notch - 0.02)
  }
  shape.lineTo(spine, 0.04)
  const geometry = new ExtrudeGeometry(shape, { depth: 0.006, bevelEnabled: false })
  geometry.translate(0, 0, -0.003)
  return geometry
}

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

    const bladeMat = new MeshBasicMaterial({
      map: steelTexture(),
      color: 0xdfe6ec,
      depthTest: false,
    })
    const blade = new Mesh(bladeGeometry(), bladeMat)
    blade.renderOrder = 999
    // bright honed strip along the cutting edge, stopping short of the tip clip
    const edge = new Mesh(
      new BoxGeometry(0.0035, 0.46, 0.0075),
      new MeshBasicMaterial({ color: 0xffffff, depthTest: false }),
    )
    edge.position.set(0.017, 0.27, 0)
    edge.renderOrder = 999
    const guard = new Mesh(
      new BoxGeometry(0.042, 0.012, 0.03),
      new MeshBasicMaterial({ map: steelTexture(), color: 0x9aa2ab, depthTest: false }),
    )
    guard.position.y = 0.036
    guard.renderOrder = 999
    const grip = new Mesh(
      new BoxGeometry(0.026, 0.115, 0.026),
      new MeshBasicMaterial({ map: metalTexture(1), color: 0x3a322a, depthTest: false }),
    )
    grip.position.y = -0.028
    grip.rotation.z = -0.06
    grip.renderOrder = 999
    const trigger = new Mesh(
      new BoxGeometry(0.008, 0.034, 0.018),
      new MeshBasicMaterial({ map: metalTexture(1), color: 0x2c2620, depthTest: false }),
    )
    trigger.position.set(0.019, -0.005, 0)
    trigger.rotation.z = 0.35
    trigger.renderOrder = 999
    this.pivot.add(blade, edge, guard, grip, trigger)
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
