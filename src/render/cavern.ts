import {
  AdditiveBlending,
  BufferAttribute,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Euler,
  Fog,
  HemisphereLight,
  IcosahedronGeometry,
  InstancedMesh,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  Quaternion,
  RepeatWrapping,
  Scene,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  Vector2,
  Vector3,
} from 'three'
import type { Arena } from '../sim/city'
import { ceilingHeightAt, insideBuildingXZ } from '../sim/city'
import { createRng } from '../sim/rng'

/** Loose stones strewn across the cavern floor. */
const RUBBLE_COUNT = 900

/**
 * The Underground's renderer half (IDEAS look spec, 2026-07-13): a rock dome over a
 * lamplit bowl, black fog as free level-of-detail, god rays at the surface openings.
 * The dome mesh samples the SAME paraboloid the sim raycasts, so hooks anchor exactly
 * on the visible rock.
 */

const loader = new TextureLoader()

function tex(path: string, repeatX = 1, repeatY = 1, srgb = true): Texture {
  const texture = loader.load(path)
  if (srgb) texture.colorSpace = SRGBColorSpace
  texture.wrapS = texture.wrapT = RepeatWrapping
  texture.repeat.set(repeatX, repeatY)
  // the floor is always seen at a grazing angle, where plain mipmapping smears the grain
  // into smooth mud; anisotropy is what keeps the dirt reading as dirt (three clamps this
  // to whatever the GPU supports)
  texture.anisotropy = 8
  return texture
}

/**
 * Permanent night in place of DayNightSky: same `{ onNight, update }` surface, but the
 * clock is meaningless down here — callbacks fire once at full night and stay there.
 * No sky, no sun; a hemisphere of cold rock over warm lamplight carries the grade.
 */
export class CavernAmbience {
  private fired = false
  private readonly callbacks: ((night: number) => void)[] = []

  constructor(scene: Scene) {
    scene.fog = new Fog(new Color(0x040404), 30, 340)
    scene.background = new Color(0x020202)
    const hemi = new HemisphereLight(0x33405c, 0x4a3a22, 1.05)
    scene.add(hemi)
    // a faint top key so roof planes separate from walls in the gloom
    const key = new DirectionalLight(0x93a0bd, 0.3)
    key.position.set(60, 120, -40)
    scene.add(key)
  }

  onNight(callback: (night: number) => void): void {
    this.callbacks.push(callback)
    if (this.fired) callback(1)
  }

  update(_fraction: number, _camera: Object3D): void {
    if (this.fired) return
    this.fired = true
    for (const callback of this.callbacks) callback(1)
  }
}

/** Deterministic lattice hash in [0, 1). */
function hash2(ix: number, iz: number, seed: number): number {
  let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263)) ^ seed
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

function valueNoise(x: number, z: number, cell: number, seed: number): number {
  const gx = Math.floor(x / cell)
  const gz = Math.floor(z / cell)
  const smooth = (t: number): number => t * t * (3 - 2 * t)
  const fx = smooth(x / cell - gx)
  const fz = smooth(z / cell - gz)
  const a = hash2(gx, gz, seed)
  const b = hash2(gx + 1, gz, seed)
  const c = hash2(gx, gz + 1, seed)
  const d = hash2(gx + 1, gz + 1, seed)
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz
}

/** Metres of dirt per texture tile: tight enough that the lamp rakes real grain. */
const DIRT_TILE = 3.5
/** Ruffle amplitude. Upward-only: a dip would open a gap under every house. */
const RUFFLE = 0.75

/**
 * The cavern floor: unpaved dirt and scree, heaped and rutted. Nobody laid cobbles down
 * here. The mesh is a subdivided disc pushed UP by layered noise — never down, or the
 * ground would sink away from the building bases that all sit at y=0. The sim keeps its
 * flat ground plane (`baseGroundY` = 0); half a metre of visual ruffle is well under the
 * step tolerance and never fights the collision.
 */
export function addCavernGround(scene: Scene, arena: Arena): void {
  const R = arena.wallRadius + 10
  const material = new MeshStandardMaterial({
    map: tex('/textures/cave_dirt.jpg', 1, 1),
    normalMap: tex('/textures/cave_dirt_nor.jpg', 1, 1, false),
    normalScale: new Vector2(2.4, 2.4), // deep grain: the lamp rakes across it at street level
    color: 0xa89d90, // graded down: the source photo reads too bright for lamplight
    roughness: 1,
  })

  // a subdivided plane, not CircleGeometry: a triangle fan has no interior vertices to
  // displace, and its UVs span 0..1 over the whole disc (that stretch is what made the
  // first pass read as smooth mud)
  const segments = 200 // ~2.5 m quads: fine enough to carry the rutting, cheap enough to ship
  const geometry = new PlaneGeometry(R * 2, R * 2, segments, segments)
  geometry.rotateX(-Math.PI / 2)
  const pos = geometry.attributes.position as BufferAttribute
  const uv = geometry.attributes.uv as BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const z = pos.getZ(i)
    // three octaves: broad spoil heaps, mid rutting, then a hard-edged scree chatter
    const broad = valueNoise(x, z, 19, 0x0a17)
    const mid = valueNoise(x, z, 6.5, 0x51c3)
    const chatter = valueNoise(x, z, 2.6, 0x7b41)
    pos.setY(i, (broad * 0.5 + mid * 0.32 + chatter * 0.18) * RUFFLE)
    // world-space UVs so the tiling is metric, not stretched across the whole cavern
    uv.setXY(i, x / DIRT_TILE, z / DIRT_TILE)
  }
  geometry.computeVertexNormals()

  const ground = new Mesh(geometry, material)
  ground.receiveShadow = true
  scene.add(ground)
  addRubble(scene, arena)
}

/** Loose stones strewn over the dirt: the "stone" half of the floor read. */
function addRubble(scene: Scene, arena: Arena): void {
  const rng = createRng(0xca7e)
  const stoneMat = new MeshStandardMaterial({
    map: tex('/textures/cave_rock.jpg', 1, 1),
    normalMap: tex('/textures/cave_rock_nor.jpg', 1, 1, false),
    roughness: 1,
    flatShading: true,
  })
  // low-poly lumps, not spheres: an icosahedron at detail 0 reads as a chipped rock
  const mesh = new InstancedMesh(new IcosahedronGeometry(1, 0), stoneMat, RUBBLE_COUNT)
  const matrix = new Matrix4()
  const quat = new Quaternion()
  const euler = new Euler()
  const color = new Color()
  const scale = new Vector3()
  const at = new Vector3()

  let placed = 0
  let guard = 0
  while (placed < RUBBLE_COUNT && guard++ < RUBBLE_COUNT * 12) {
    const angle = rng() * Math.PI * 2
    const r = Math.sqrt(rng()) * (arena.wallRadius - 6) // even spread, not centre-heavy
    const x = Math.cos(angle) * r
    const z = Math.sin(angle) * r
    if (insideBuildingXZ(arena, x, z, 1)) continue // stones lie in the streets, not in walls
    const size = 0.25 + rng() * 0.85
    euler.set(rng() * Math.PI, rng() * Math.PI * 2, rng() * Math.PI)
    quat.setFromEuler(euler)
    // squashed and half-buried: a boulder sitting proud on the dirt looks placed
    scale.set(size * (1 + rng() * 0.5), size * (0.5 + rng() * 0.3), size * (1 + rng() * 0.5))
    at.set(x, size * 0.16, z)
    matrix.compose(at, quat, scale)
    mesh.setMatrixAt(placed, matrix)
    color.setHSL(0.08, 0.06, 0.34 + rng() * 0.2)
    mesh.setColorAt(placed, color)
    placed++
  }
  mesh.count = placed
  mesh.receiveShadow = true
  scene.add(mesh)
}

/** The dome, the perimeter rock, the pillars and stalactites, and the god rays. */
export function addCavern(scene: Scene, arena: Arena): void {
  const cavern = arena.cavern
  if (!cavern) return
  const R = arena.wallRadius

  const domeRock = new MeshStandardMaterial({
    map: tex('/textures/cave_rock.jpg', 14, 5),
    normalMap: tex('/textures/cave_rock_nor.jpg', 14, 5, false),
    color: 0xa39a90, // graded down so the lathe's pole-pinch never reads in the beam
    roughness: 1,
    side: DoubleSide,
  })

  // the dome samples the sim's paraboloid: same surface the hooks anchor on
  const profile: Vector2[] = []
  const steps = 28
  for (let i = 0; i <= steps; i++) {
    const r = (i / steps) * (R + 4)
    profile.push(new Vector2(Math.max(r, 0.01), ceilingHeightAt(arena, r, 0)))
  }
  const dome = new Mesh(new LatheGeometry(profile, 56), domeRock)
  scene.add(dome)

  // the perimeter: raw rock rising to meet the dome edge (no battlements down here)
  const wallRock = new MeshStandardMaterial({
    map: tex('/textures/cave_rock.jpg', 18, 2.2),
    normalMap: tex('/textures/cave_rock_nor.jpg', 18, 2.2, false),
    roughness: 1,
    side: DoubleSide,
  })
  const wall = new Mesh(
    new CylinderGeometry(R + 2, R + 5, cavern.edgeY + 1, 64, 1, true),
    wallRock,
  )
  wall.position.y = (cavern.edgeY + 1) / 2
  scene.add(wall)

  const matrix = new Matrix4()
  const quat = new Quaternion()
  const color = new Color()

  // rock pillars: vertical striation, a whisper of taper (the sim keeps them straight;
  // ±6% of radius never reads at pillar scale in the gloom)
  const pillars = arena.buildings.filter((b) => b.kind === 'pillar')
  if (pillars.length > 0) {
    const pillarRock = new MeshStandardMaterial({
      map: tex('/textures/cave_rock.jpg', 2, 7),
      normalMap: tex('/textures/cave_rock_nor.jpg', 2, 7, false),
      roughness: 1,
    })
    const geometry = new CylinderGeometry(0.97, 1.06, 1, 12, 1)
    geometry.translate(0, 0.5, 0)
    const mesh = new InstancedMesh(geometry, pillarRock, pillars.length)
    pillars.forEach((b, i) => {
      matrix.compose(new Vector3(b.x, 0, b.z), quat, new Vector3(b.w / 2, b.h + 1, b.w / 2))
      mesh.setMatrixAt(i, matrix)
      color.setHSL(0.07, 0.1, 0.42 + b.tint * 0.16)
      mesh.setColorAt(i, color)
    })
    scene.add(mesh)
  }

  // stalactites: cones hanging from the dome. The sim collides their bounding cylinder;
  // a hook near the tip may float half a metre — unreadable 30m overhead in the dark.
  const stalactites = arena.buildings.filter((b) => b.kind === 'stalactite')
  if (stalactites.length > 0) {
    const geometry = new ConeGeometry(1, 1, 9)
    geometry.rotateX(Math.PI)
    geometry.translate(0, 0.5, 0) // tip at local y=0, base at y=1
    const mesh = new InstancedMesh(geometry, domeRock, stalactites.length)
    stalactites.forEach((b, i) => {
      const length = b.h - b.y0
      matrix.compose(
        new Vector3(b.x, b.y0, b.z),
        quat,
        new Vector3((b.w / 2) * 1.15, length + 0.8, (b.w / 2) * 1.15),
      )
      mesh.setMatrixAt(i, matrix)
      color.setHSL(0.07, 0.1, 0.4 + b.tint * 0.14)
      mesh.setColorAt(i, color)
    })
    scene.add(mesh)
  }

  // god rays: the surface pouring through the openings — the landmarks the bowl
  // orients by (transient/indicator exception to the texture rule, like gate flares)
  for (const shaft of cavern.shafts) {
    const ceilY = ceilingHeightAt(arena, shaft.x, shaft.z)
    const beam = new Mesh(
      new CylinderGeometry(shaft.radius * 0.55, shaft.radius * 1.25, ceilY, 24, 1, true),
      new MeshBasicMaterial({
        color: 0xffedc2,
        transparent: true,
        opacity: 0.07,
        blending: AdditiveBlending,
        depthWrite: false,
        side: DoubleSide,
        fog: false,
      }),
    )
    beam.position.set(shaft.x, ceilY / 2, shaft.z)

    const mouth = new Mesh(
      new CircleGeometry(shaft.radius * 0.55, 24),
      new MeshBasicMaterial({ color: 0xfff6dd, transparent: true, opacity: 0.9, fog: false }),
    )
    mouth.rotation.x = Math.PI / 2
    mouth.position.set(shaft.x, ceilY - 0.4, shaft.z)

    const pool = new Mesh(
      new CircleGeometry(shaft.radius * 1.25, 32),
      new MeshBasicMaterial({
        color: 0xffe9b8,
        transparent: true,
        opacity: 0.1,
        blending: AdditiveBlending,
        depthWrite: false,
        fog: false,
      }),
    )
    pool.rotation.x = -Math.PI / 2
    pool.position.set(shaft.x, 0.06, shaft.z)

    scene.add(beam, mouth, pool)
  }
}
