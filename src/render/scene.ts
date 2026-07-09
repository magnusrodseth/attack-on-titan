import {
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Fog,
  HemisphereLight,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  RingGeometry,
  Scene,
  TorusGeometry,
  Vector3,
  BoxGeometry,
} from 'three'
import type { Arena } from '../sim/city'

const SKY = new Color(0xb9cfe2)

/** Gable roof prism: unit footprint, ridge along local X at y=1, eaves at y=0. */
function gablePrismGeometry(): BufferGeometry {
  const a = [-0.5, 0, -0.5]
  const b = [0.5, 0, -0.5]
  const c = [0.5, 0, 0.5]
  const d = [-0.5, 0, 0.5]
  const r1 = [-0.5, 1, 0]
  const r2 = [0.5, 1, 0]
  const tris = [
    // slope facing -z
    a, r2, b,
    a, r1, r2,
    // slope facing +z
    c, r1, d,
    c, r2, r1,
    // gable ends
    d, r1, a,
    b, r2, c,
  ]
  const positions = new Float32Array(tris.flat())
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.computeVertexNormals()
  return geometry
}

export function buildScene(arena: Arena): Scene {
  const scene = new Scene()
  scene.background = SKY
  scene.fog = new Fog(SKY, 70, 460)

  scene.add(new HemisphereLight(0xd8e8ff, 0x8a7a63, 1.1))
  const sun = new DirectionalLight(0xfff1da, 2.4)
  sun.position.set(140, 200, 80)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.camera.left = -220
  sun.shadow.camera.right = 220
  sun.shadow.camera.top = 220
  sun.shadow.camera.bottom = -220
  sun.shadow.camera.far = 600
  sun.shadow.bias = -0.0004
  scene.add(sun)

  const ground = new Mesh(
    new CircleGeometry(arena.wallRadius + 60, 48).rotateX(-Math.PI / 2),
    new MeshStandardMaterial({ color: 0x8b8071, roughness: 1 }),
  )
  ground.receiveShadow = true
  scene.add(ground)

  addHouses(scene, arena)
  addTowers(scene, arena)
  addWall(scene, arena)
  addStation(scene, arena)
  return scene
}

function addHouses(scene: Scene, arena: Arena): void {
  const houses = arena.buildings.filter((b) => b.kind === 'house')
  if (houses.length === 0) return

  const bodyGeometry = new BoxGeometry(1, 1, 1)
  bodyGeometry.translate(0, 0.5, 0)
  const bodies = new InstancedMesh(
    bodyGeometry,
    new MeshStandardMaterial({ roughness: 0.95 }),
    houses.length,
  )
  const roofs = new InstancedMesh(
    gablePrismGeometry(),
    new MeshStandardMaterial({ roughness: 0.85 }),
    houses.length,
  )
  bodies.castShadow = true
  bodies.receiveShadow = true
  roofs.castShadow = true

  const matrix = new Matrix4()
  const quat = new Quaternion()
  const rotated = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2)
  const color = new Color()
  houses.forEach((house, i) => {
    const roofRise = house.h * 0.3
    const eave = house.h - roofRise
    matrix.compose(new Vector3(house.x, 0, house.z), quat, new Vector3(house.w, eave, house.d))
    bodies.setMatrixAt(i, matrix)
    // plaster tones: cream, tan, pale ochre
    color.setHSL(0.07 + house.tint * 0.06, 0.26 + house.tint * 0.12, 0.66 + (house.tint % 0.31) * 0.35)
    bodies.setColorAt(i, color)

    const alongX = house.ridgeAxis === 'x'
    matrix.compose(
      new Vector3(house.x, eave, house.z),
      alongX ? quat : rotated,
      alongX ? new Vector3(house.w, roofRise, house.d) : new Vector3(house.d, roofRise, house.w),
    )
    roofs.setMatrixAt(i, matrix)
    color.setHSL(0.03 + house.tint * 0.035, 0.52, 0.32 + (house.tint % 0.23) * 0.5)
    roofs.setColorAt(i, color)
  })
  scene.add(bodies, roofs)
}

function addTowers(scene: Scene, arena: Arena): void {
  const stone = new MeshStandardMaterial({ color: 0x9a938a, roughness: 0.9 })
  const slate = new MeshStandardMaterial({ color: 0x4c5560, roughness: 0.7 })
  for (const tower of arena.buildings) {
    if (tower.kind !== 'tower') continue
    const bodyH = tower.h * 0.78
    const body = new Mesh(new BoxGeometry(tower.w, bodyH, tower.d), stone)
    body.position.set(tower.x, bodyH / 2, tower.z)
    const spire = new Mesh(
      new ConeGeometry(tower.w * 0.72, tower.h - bodyH, 4),
      slate,
    )
    spire.position.set(tower.x, bodyH + (tower.h - bodyH) / 2, tower.z)
    spire.rotation.y = Math.PI / 4
    body.castShadow = spire.castShadow = true
    body.receiveShadow = true
    scene.add(body, spire)
  }
}

function addWall(scene: Scene, arena: Arena): void {
  const stone = new MeshStandardMaterial({ color: 0x878c90, roughness: 1, side: DoubleSide })
  const wall = new Mesh(
    new CylinderGeometry(arena.wallRadius + 6, arena.wallRadius + 8, arena.wallHeight, 64, 1, true),
    stone,
  )
  wall.position.y = arena.wallHeight / 2
  wall.receiveShadow = true
  scene.add(wall)

  const rim = new Mesh(
    new TorusGeometry(arena.wallRadius + 7, 2.4, 6, 64),
    new MeshStandardMaterial({ color: 0x767b7f, roughness: 1 }),
  )
  rim.rotation.x = Math.PI / 2
  rim.position.y = arena.wallHeight
  scene.add(rim)
}

function addStation(scene: Scene, arena: Arena): void {
  const pole = new Mesh(
    new CylinderGeometry(0.35, 0.35, 16, 8),
    new MeshStandardMaterial({ color: 0x5a4632, roughness: 0.8 }),
  )
  pole.position.set(arena.station.x, 8, arena.station.z)
  pole.castShadow = true

  const banner = new Mesh(
    new BoxGeometry(4.5, 3, 0.15),
    new MeshStandardMaterial({
      color: 0x1f6e43,
      emissive: 0x2fa35f,
      emissiveIntensity: 0.55,
      side: DoubleSide,
    }),
  )
  banner.position.set(arena.station.x, 13.5, arena.station.z)

  const ring = new Mesh(
    new RingGeometry(8.6, 10, 48).rotateX(-Math.PI / 2),
    new MeshStandardMaterial({
      color: 0x2fa35f,
      emissive: 0x2fa35f,
      emissiveIntensity: 0.8,
      transparent: true,
      opacity: 0.55,
    }),
  )
  ring.position.set(arena.station.x, 0.08, arena.station.z)
  scene.add(pole, banner, ring)
}

/** Marker type so main.ts can find effects-agnostic helpers if needed later. */
export type SceneRoot = Object3D
