import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  LoadingManager,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Fog,
  Group,
  HemisphereLight,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  Quaternion,
  RepeatWrapping,
  RingGeometry,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  TorusGeometry,
  Vector3,
} from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import type { Arena } from '../sim/city'
import { groundHeightAt } from '../sim/city'
import { createRng } from '../sim/rng'

const SKY = new Color(0xb9cfe2)
const loader = new TextureLoader()
const gltfLoader = new GLTFLoader()

// KayKit GLBs reference a Textures/colormap.png that ships separately; we flat-color the
// meshes anyway, so satisfy the lookup with a 1px placeholder to keep the console clean.
const WHITE_PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const kaykitManager = new LoadingManager()
kaykitManager.setURLModifier((url) => (url.endsWith('colormap.png') ? WHITE_PIXEL : url))
const kaykitLoader = new GLTFLoader(kaykitManager)


function tex(path: string, repeatX = 1, repeatY = 1, srgb = true): Texture {
  const texture = loader.load(path)
  if (srgb) texture.colorSpace = SRGBColorSpace
  texture.wrapS = texture.wrapT = RepeatWrapping
  texture.repeat.set(repeatX, repeatY)
  return texture
}

export interface BuiltScene {
  scene: Scene
  updateScenery: (dt: number) => void
}

/** Gable roof prism with planar UVs: unit footprint, ridge along local X at y=1. */
function gablePrismGeometry(): BufferGeometry {
  const a = [-0.5, 0, -0.5]
  const b = [0.5, 0, -0.5]
  const c = [0.5, 0, 0.5]
  const d = [-0.5, 0, 0.5]
  const r1 = [-0.5, 1, 0]
  const r2 = [0.5, 1, 0]
  const tris = [a, r2, b, a, r1, r2, c, r1, d, c, r2, r1, d, r1, a, b, r2, c]
  const positions = new Float32Array(tris.flat())
  const uvs = new Float32Array(
    tris.flat().length === 0
      ? []
      : tris.flatMap((v) => [v[0]! + 0.5, v[2]! + 0.5]),
  )
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new BufferAttribute(uvs, 2))
  geometry.computeVertexNormals()
  return geometry
}

export function buildScene(arena: Arena): BuiltScene {
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
    new MeshStandardMaterial({
      map: tex('/textures/cobble.jpg', 90, 90),
      normalMap: tex('/textures/cobble_nor.jpg', 90, 90, false),
      roughness: 1,
    }),
  )
  ground.receiveShadow = true
  scene.add(ground)

  addHouses(scene, arena)
  addTowers(scene, arena)
  addWall(scene, arena)
  addStation(scene, arena)

  const scenery = addScenery(scene, arena)
  return { scene, updateScenery: scenery }
}

function addHouses(scene: Scene, arena: Arena): void {
  const houses = arena.buildings.filter((b) => b.kind === 'house')
  if (houses.length === 0) return

  const bodyGeometry = new BoxGeometry(1, 1, 1)
  bodyGeometry.translate(0, 0.5, 0)
  // roughly a third of the district is warm brick, the rest tinted plaster
  const isBrick = (tint: number) => tint < 0.35
  const plasterBodies = new InstancedMesh(
    bodyGeometry,
    new MeshStandardMaterial({ map: tex('/textures/plaster.jpg', 2, 1), roughness: 0.95 }),
    houses.length,
  )
  const brickBodies = new InstancedMesh(
    bodyGeometry,
    new MeshStandardMaterial({
      map: tex('/textures/brick.jpg', 2, 1),
      normalMap: tex('/textures/brick_nor.jpg', 2, 1, false),
      roughness: 0.95,
    }),
    houses.length,
  )
  // most roofs are weathered terracotta, a fifth are mossy grey slate
  const isSlate = (tint: number) => tint > 0.8
  const roofGeometry = gablePrismGeometry()
  const terraRoofs = new InstancedMesh(
    roofGeometry,
    new MeshStandardMaterial({
      map: tex('/textures/roof.jpg', 3, 3),
      normalMap: tex('/textures/roof_nor.jpg', 3, 3, false),
      roughness: 0.85,
    }),
    houses.length,
  )
  const slateRoofs = new InstancedMesh(
    roofGeometry,
    new MeshStandardMaterial({ map: tex('/textures/roof_slate.jpg', 3, 3), roughness: 0.85 }),
    houses.length,
  )
  plasterBodies.castShadow = brickBodies.castShadow = true
  plasterBodies.receiveShadow = brickBodies.receiveShadow = true
  terraRoofs.castShadow = slateRoofs.castShadow = true
  let plasterCount = 0
  let brickCount = 0
  let terraCount = 0
  let slateCount = 0

  // emissive-look window quads: shutters dark, ~30% glowing warm
  const windowSlots: Array<{ pos: Vector3; rotY: number; lit: boolean }> = []

  const matrix = new Matrix4()
  const quat = new Quaternion()
  const rotated = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2)
  const color = new Color()
  const rng = createRng(0xc0ffee)
  houses.forEach((house) => {
    const roofRise = house.h * 0.3
    const eave = house.h - roofRise
    matrix.compose(new Vector3(house.x, 0, house.z), quat, new Vector3(house.w, eave, house.d))
    if (isBrick(house.tint)) {
      brickBodies.setMatrixAt(brickCount, matrix)
      // bricks keep their own color; jitter brightness only
      color.setHSL(0.07, 0.2, 0.72 + (house.tint % 0.18) * 1.2)
      brickBodies.setColorAt(brickCount, color)
      brickCount++
    } else {
      plasterBodies.setMatrixAt(plasterCount, matrix)
      // plaster tones: cream, tan, pale ochre — per-instance tint multiplies the texture
      color.setHSL(0.07 + house.tint * 0.06, 0.26 + house.tint * 0.12, 0.66 + (house.tint % 0.31) * 0.35)
      plasterBodies.setColorAt(plasterCount, color)
      plasterCount++
    }

    const alongX = house.ridgeAxis === 'x'
    matrix.compose(
      new Vector3(house.x, eave, house.z),
      alongX ? quat : rotated,
      alongX ? new Vector3(house.w, roofRise, house.d) : new Vector3(house.d, roofRise, house.w),
    )
    if (isSlate(house.tint)) {
      slateRoofs.setMatrixAt(slateCount, matrix)
      color.setHSL(0.6, 0.04, 0.55 + (house.tint % 0.12) * 2)
      slateRoofs.setColorAt(slateCount, color)
      slateCount++
    } else {
      terraRoofs.setMatrixAt(terraCount, matrix)
      color.setHSL(0.03 + house.tint * 0.035, 0.4, 0.5 + (house.tint % 0.23) * 0.8)
      terraRoofs.setColorAt(terraCount, color)
      terraCount++
    }

    // two floors of windows on both long faces
    const longSpan = alongX ? house.w : house.d
    const perFloor = Math.max(1, Math.floor(longSpan / 4.5))
    for (const side of [-1, 1]) {
      for (let floor = 0; floor < 2; floor++) {
        for (let k = 0; k < perFloor; k++) {
          const along = ((k + 0.5) / perFloor - 0.5) * (longSpan - 2)
          const y = eave * (0.3 + floor * 0.38)
          const offset = (alongX ? house.d : house.w) / 2 + 0.06
          windowSlots.push({
            pos: alongX
              ? new Vector3(house.x + along, y, house.z + side * offset)
              : new Vector3(house.x + side * offset, y, house.z + along),
            rotY: alongX ? (side > 0 ? 0 : Math.PI) : side > 0 ? Math.PI / 2 : -Math.PI / 2,
            lit: rng() < 0.3,
          })
        }
      }
    }
  })
  plasterBodies.count = plasterCount
  brickBodies.count = brickCount
  terraRoofs.count = terraCount
  slateRoofs.count = slateCount
  scene.add(plasterBodies, brickBodies, terraRoofs, slateRoofs)

  // photo window texture: neutral tint reads as dark glass, overbright warm tint as lamplight
  const windows = new InstancedMesh(
    new PlaneGeometry(1.2, 1.6),
    new MeshBasicMaterial({ map: tex('/textures/window.png'), side: DoubleSide }),
    windowSlots.length,
  )
  const windowQuat = new Quaternion()
  windowSlots.forEach((slot, i) => {
    windowQuat.setFromAxisAngle(new Vector3(0, 1, 0), slot.rotY)
    matrix.compose(slot.pos, windowQuat, new Vector3(1, 1, 1))
    windows.setMatrixAt(i, matrix)
    if (slot.lit) {
      color.setRGB(2.4, 1.9, 1.1) // overbright warm glow through the glass
    } else {
      color.setScalar(0.85 + rng() * 0.3)
    }
    windows.setColorAt(i, color)
  })
  scene.add(windows)
}

function addTowers(scene: Scene, arena: Arena): void {
  const stone = new MeshStandardMaterial({
    map: tex('/textures/wall.jpg', 2, 4),
    roughness: 0.9,
  })
  const slate = new MeshStandardMaterial({ color: 0x4c5560, roughness: 0.7 })
  for (const tower of arena.buildings) {
    if (tower.kind !== 'tower') continue
    const bodyH = tower.h * 0.78
    const body = new Mesh(new BoxGeometry(tower.w, bodyH, tower.d), stone)
    body.position.set(tower.x, bodyH / 2, tower.z)
    const spire = new Mesh(new ConeGeometry(tower.w * 0.72, tower.h - bodyH, 4), slate)
    spire.position.set(tower.x, bodyH + (tower.h - bodyH) / 2, tower.z)
    spire.rotation.y = Math.PI / 4
    body.castShadow = spire.castShadow = true
    body.receiveShadow = true
    scene.add(body, spire)
  }
}

function addWall(scene: Scene, arena: Arena): void {
  const stone = new MeshStandardMaterial({
    map: tex('/textures/wall.jpg', 40, 4),
    normalMap: tex('/textures/wall_nor.jpg', 40, 4, false),
    roughness: 1,
    side: DoubleSide,
  })
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

/** Clouds, birds, trees and a mountain ring: motion and depth beyond the gameplay set. */
function addScenery(scene: Scene, arena: Arena): (dt: number) => void {
  const rng = createRng(0x5eed)
  const clouds = new Group()
  scene.add(clouds)

  gltfLoader.load('/models/starter/cloud.glb', (gltf) => {
    for (let i = 0; i < 9; i++) {
      const cloud = gltf.scene.clone(true)
      const radius = 80 + rng() * 240
      const angle = rng() * Math.PI * 2
      cloud.position.set(Math.cos(angle) * radius, 120 + rng() * 60, Math.sin(angle) * radius)
      cloud.scale.set(14 + rng() * 8, 7 + rng() * 4, 14 + rng() * 8) // flattened puffs, not boulders
      cloud.rotation.y = rng() * Math.PI * 2
      clouds.add(cloud)
    }
  })

  kaykitLoader.load('/models/kaykit/mountain.glb', (gltf) => {
    // KayKit UVs are atlas islands, so a rock texture reads as varied craggy patches
    const rockMat = new MeshStandardMaterial({
      map: tex('/textures/rock.jpg', 2, 2),
      color: 0xb8bcc4,
      roughness: 1,
    })
    gltf.scene.traverse((obj) => {
      if (obj instanceof Mesh) obj.material = rockMat
    })
    for (let i = 0; i < 7; i++) {
      const mountain = gltf.scene.clone(true)
      const angle = (i / 7) * Math.PI * 2 + rng() * 0.5
      const radius = arena.wallRadius + 160 + rng() * 90
      mountain.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius)
      mountain.scale.setScalar(65 + rng() * 45)
      mountain.rotation.y = rng() * Math.PI * 2
      scene.add(mountain)
    }
  })

  // textured procedural trees: bark trunk + leafy canopy blobs
  const barkMat = new MeshStandardMaterial({ map: tex('/textures/bark.jpg', 1, 2), roughness: 1 })
  const leafMat = new MeshStandardMaterial({ map: tex('/textures/leaves.jpg', 2, 2), roughness: 1 })
  const trunkGeometry = new CylinderGeometry(0.22, 0.38, 3.4, 7)
  const canopyGeometry = new SphereGeometry(1, 9, 7)
  let placed = 0
  let attempts = 0
  while (placed < 24 && attempts < 300) {
    attempts++
    const angle = rng() * Math.PI * 2
    const radius = arena.plazaRadius + 12 + rng() * (arena.wallRadius - arena.plazaRadius - 30)
    const x = Math.cos(angle) * radius
    const z = Math.sin(angle) * radius
    if (groundHeightAt(arena, x, z) > 0) continue
    const tree = new Group()
    const trunk = new Mesh(trunkGeometry, barkMat)
    trunk.position.y = 1.7
    trunk.castShadow = true
    tree.add(trunk)
    const blobs = 2 + Math.floor(rng() * 2)
    for (let b = 0; b < blobs; b++) {
      const canopy = new Mesh(canopyGeometry, leafMat)
      canopy.position.set((rng() - 0.5) * 1.6, 3.2 + b * 1.1 + rng() * 0.5, (rng() - 0.5) * 1.6)
      canopy.scale.setScalar(1.5 + rng() * 0.9)
      canopy.castShadow = true
      tree.add(canopy)
    }
    tree.position.set(x, 0, z)
    tree.scale.setScalar(1.6 + rng() * 1.2)
    tree.rotation.y = rng() * Math.PI * 2
    scene.add(tree)
    placed++
  }

  // birds: cheap V-shaped billboards drifting in circles
  const birdGeometry = new BufferGeometry()
  birdGeometry.setAttribute(
    'position',
    new BufferAttribute(
      new Float32Array([-1, 0.35, 0, 0, 0, 0, -0.15, 0.05, 0, 1, 0.35, 0, 0, 0, 0, 0.15, 0.05, 0]),
      3,
    ),
  )
  const birdMat = new MeshBasicMaterial({ color: 0x2b2f36, side: DoubleSide })
  const birds: Array<{ mesh: Mesh; radius: number; angle: number; speed: number; y: number; phase: number }> = []
  for (let i = 0; i < 11; i++) {
    const mesh = new Mesh(birdGeometry, birdMat)
    mesh.scale.setScalar(0.9 + rng() * 0.7)
    const bird = {
      mesh,
      radius: 40 + rng() * 110,
      angle: rng() * Math.PI * 2,
      speed: 0.08 + rng() * 0.12,
      y: 55 + rng() * 45,
      phase: rng() * Math.PI * 2,
    }
    birds.push(bird)
    scene.add(mesh)
  }

  let time = 0
  return (dt: number) => {
    time += dt
    clouds.rotation.y += dt * 0.004
    for (const bird of birds) {
      bird.angle += bird.speed * dt
      const flap = Math.sin(time * 7 + bird.phase)
      bird.mesh.position.set(
        Math.cos(bird.angle) * bird.radius,
        bird.y + Math.sin(time * 0.7 + bird.phase) * 3,
        Math.sin(bird.angle) * bird.radius,
      )
      bird.mesh.scale.y = (0.9 + Math.abs(flap)) * 0.8
      bird.mesh.rotation.y = -bird.angle
    }
  }
}

export type SceneRoot = Object3D
