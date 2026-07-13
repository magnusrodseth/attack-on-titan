import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  LoadingManager,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
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
  Shape,
  ShapeGeometry,
  SphereGeometry,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  TorusGeometry,
  Vector3,
} from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import type { Arena, Building } from '../sim/city'
import { baseGroundY, eaveHeight, groundHeightAt } from '../sim/city'
import { BLOCK } from '../sim/citygen'
import { createRng } from '../sim/rng'
import { addCavern, addCavernGround } from './cavern'
import { DayNightSky } from './daynight'

const loader = new TextureLoader()

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

/** What main.ts drives per frame: DayNightSky over the district, CavernAmbience below. */
export interface SkyDriver {
  onNight(callback: (night: number) => void): void
  update(fraction: number, camera: Object3D): void
}

export interface BuiltScene {
  scene: Scene
  updateScenery: (dt: number, camera?: Object3D) => void
  dayNight: SkyDriver
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
    tris.flat().length === 0 ? [] : tris.flatMap((v) => [v[0]! + 0.5, v[2]! + 0.5]),
  )
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new BufferAttribute(uvs, 2))
  geometry.computeVertexNormals()
  return geometry
}

export function buildScene(arena: Arena): BuiltScene {
  const scene = new Scene()

  if (arena.cavern) {
    // the Underground: the same housing/props/station set under a rock dome, and the same
    // sky above it — the dome is cut open at every shaft, so the sun, moon and stars all
    // show through the holes and the hour reads down here. Only the rock's grade differs:
    // dim close air, weak ambient, no direct sun. No canal, no scenery beyond the wall.
    const dayNight = new DayNightSky(scene, { underground: true })
    addCavernGround(scene, arena)
    dayNight.onNight(addHousing(scene, arena))
    addLandmarks(scene, arena)
    addProps(scene, arena)
    addBanners(scene, arena)
    addStation(scene, arena)

    const cavern = addCavern(scene, arena)
    dayNight.onNight(cavern.setNight)
    return { scene, updateScenery: cavern.update, dayNight }
  }

  const dayNight = new DayNightSky(scene)

  addGround(scene, arena)
  const waterUpdate = addCanal(scene, arena)
  dayNight.onNight(addHousing(scene, arena))
  addLandmarks(scene, arena)
  addProps(scene, arena)
  addBanners(scene, arena)
  addWall(scene, arena)
  addStation(scene, arena)

  const scenery = addScenery(scene, arena)
  dayNight.onNight(scenery.setNight)
  const updateScenery = (dt: number, camera?: Object3D): void => {
    waterUpdate(dt)
    scenery.update(dt, camera)
  }
  return { scene, updateScenery, dayNight }
}

/**
 * Cobbled ground with the canal strip left open. A hole crossing the disc's boundary
 * breaks ShapeGeometry triangulation, so the ground is two chord-clipped pieces —
 * one each side of the canal — instead of one holed disc.
 */
function addGround(scene: Scene, arena: Arena): void {
  const R = arena.wallRadius + 60
  const material = new MeshStandardMaterial({
    // ShapeGeometry UVs are world-sized: repeat per unit so the cobbles tile at ~5m
    map: tex('/textures/cobble.jpg', 0.2, 0.2),
    normalMap: tex('/textures/cobble_nor.jpg', 0.2, 0.2, false),
    roughness: 1,
  })
  const pieces: Shape[] = []
  if (arena.canal) {
    const hw = arena.canal.halfWidth
    const thetaWest = Math.acos((arena.canal.x - hw) / R)
    const west = new Shape()
    west.absarc(0, 0, R, thetaWest, Math.PI * 2 - thetaWest, false)
    west.closePath() // the straight chord along the canal's west bank
    const thetaEast = Math.acos((arena.canal.x + hw) / R)
    const east = new Shape()
    east.absarc(0, 0, R, -thetaEast, thetaEast, false)
    east.closePath()
    pieces.push(west, east)
  } else {
    const disc = new Shape()
    disc.absarc(0, 0, R, 0, Math.PI * 2, false)
    pieces.push(disc)
  }
  for (const piece of pieces) {
    const ground = new Mesh(new ShapeGeometry(piece, 48).rotateX(-Math.PI / 2), material)
    ground.receiveShadow = true
    scene.add(ground)
  }
}

/** The canal trench: stone embankments, a rocky bed, and slow water (CC0 textures). */
function addCanal(scene: Scene, arena: Arena): (dt: number) => void {
  const canal = arena.canal
  if (!canal) return () => {}
  const length = 2 * (arena.wallRadius + 8)
  const hw = canal.halfWidth

  const bed = new Mesh(
    new PlaneGeometry(hw * 2, length).rotateX(-Math.PI / 2),
    new MeshStandardMaterial({ map: tex('/textures/rock.jpg', 3, 60), roughness: 1 }),
  )
  bed.position.set(canal.x, canal.bedY, 0)
  scene.add(bed)

  const sideMat = new MeshStandardMaterial({
    map: tex('/textures/wall.jpg', 60, 0.6),
    roughness: 1,
  })
  for (const side of [-1, 1]) {
    const wall = new Mesh(new BoxGeometry(0.6, -canal.bedY + 0.25, length), sideMat)
    wall.position.set(canal.x + side * (hw + 0.28), (canal.bedY + 0.25) / 2, 0)
    wall.receiveShadow = true
    scene.add(wall)
  }

  const waterTexture = tex('/textures/water.jpg', 2, 46)
  const waterNormal = tex('/textures/water_nor.jpg', 2, 46, false)
  const water = new Mesh(
    new PlaneGeometry(hw * 2 - 0.5, length).rotateX(-Math.PI / 2),
    new MeshStandardMaterial({
      map: waterTexture,
      normalMap: waterNormal,
      // the sourced river albedo is deep-water dark; a strong cold tint plus a whisper
      // of emissive reads as sky bouncing off the surface (metalness would need an
      // envmap and renders black without one)
      color: 0xa9cfdc,
      emissive: 0x1c3742,
      emissiveIntensity: 0.55,
      roughness: 0.16,
      metalness: 0,
      transparent: true,
      opacity: 0.85,
    }),
  )
  water.position.set(canal.x, canal.waterY, 0)
  scene.add(water)

  return (dt: number) => {
    // a slow, steady drift downstream sells moving water without a shader
    waterTexture.offset.y = (waterTexture.offset.y + dt * 0.018) % 1
    waterNormal.offset.y = (waterNormal.offset.y + dt * 0.024) % 1
  }
}

/** Houses and warehouses: instanced bodies, roofs, windows, doors and awnings. */
function addHousing(scene: Scene, arena: Arena): (night: number) => void {
  const houses = arena.buildings.filter((b) => b.kind === 'house')
  const warehouses = arena.buildings.filter((b) => b.kind === 'warehouse')
  if (houses.length === 0 && warehouses.length === 0) return () => {}

  const bodyGeometry = new BoxGeometry(1, 1, 1)
  bodyGeometry.translate(0, 0.5, 0)
  // roughly a third of the district is warm brick, the rest tinted plaster
  const isBrick = (tint: number) => tint < 0.35
  const plasterBodies = new InstancedMesh(
    bodyGeometry,
    new MeshStandardMaterial({ map: tex('/textures/plaster.jpg', 2, 2), roughness: 0.95 }),
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
  // warehouses are stone-built: they read as a different class of building at a glance
  const stoneBodies = new InstancedMesh(
    bodyGeometry,
    new MeshStandardMaterial({
      map: tex('/textures/wall.jpg', 3, 2),
      normalMap: tex('/textures/wall_nor.jpg', 3, 2, false),
      roughness: 1,
    }),
    warehouses.length,
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
    houses.length + warehouses.length,
  )
  const slateRoofs = new InstancedMesh(
    roofGeometry,
    new MeshStandardMaterial({ map: tex('/textures/roof_slate.jpg', 3, 3), roughness: 0.85 }),
    houses.length + warehouses.length,
  )
  plasterBodies.castShadow = brickBodies.castShadow = stoneBodies.castShadow = true
  plasterBodies.receiveShadow = brickBodies.receiveShadow = stoneBodies.receiveShadow = true
  terraRoofs.castShadow = slateRoofs.castShadow = true
  let plasterCount = 0
  let brickCount = 0
  let stoneCount = 0
  let terraCount = 0
  let slateCount = 0

  // emissive-look window quads: ~30% glow warm all day; more lamps come on as
  // night deepens (nightAt is each household's lights-on threshold)
  const windowSlots: Array<{
    pos: Vector3
    rotY: number
    lit: boolean
    nightAt: number
    baseGray: number
  }> = []
  const doorSlots: Array<{ pos: Vector3; rotY: number; shade: number }> = []
  const awningSlots: Array<{ pos: Vector3; rotY: number; hue: number }> = []

  const matrix = new Matrix4()
  const quat = new Quaternion()
  const rotated = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2)
  const color = new Color()
  const rng = createRng(0xc0ffee)

  const placeRoof = (b: Building, eave: number): void => {
    const alongX = b.ridgeAxis === 'x'
    matrix.compose(
      new Vector3(b.x, eave, b.z),
      alongX ? quat : rotated,
      alongX ? new Vector3(b.w, b.h - eave, b.d) : new Vector3(b.d, b.h - eave, b.w),
    )
    if (isSlate(b.tint)) {
      slateRoofs.setMatrixAt(slateCount, matrix)
      color.setHSL(0.6, 0.04, 0.55 + (b.tint % 0.12) * 2)
      slateRoofs.setColorAt(slateCount, color)
      slateCount++
    } else {
      terraRoofs.setMatrixAt(terraCount, matrix)
      color.setHSL(0.03 + b.tint * 0.035, 0.4, 0.5 + (b.tint % 0.23) * 0.8)
      terraRoofs.setColorAt(terraCount, color)
      terraCount++
    }
  }

  const placeOpenings = (b: Building, eave: number, sparse: boolean): void => {
    const alongX = b.ridgeAxis === 'x'
    const longSpan = alongX ? b.w : b.d
    const perFloor = Math.max(1, Math.floor(longSpan / (sparse ? 7.5 : 4.5)))
    const floors = sparse ? 1 : 2
    for (const side of [-1, 1]) {
      const offset = (alongX ? b.d : b.w) / 2 + 0.06
      const rotY = alongX ? (side > 0 ? 0 : Math.PI) : side > 0 ? Math.PI / 2 : -Math.PI / 2
      for (let floor = 0; floor < floors; floor++) {
        for (let k = 0; k < perFloor; k++) {
          const along = ((k + 0.5) / perFloor - 0.5) * (longSpan - 2)
          const y = eave * (0.3 + floor * 0.38)
          const lit = rng() < 0.3
          windowSlots.push({
            pos: alongX
              ? new Vector3(b.x + along, y, b.z + side * offset)
              : new Vector3(b.x + side * offset, y, b.z + along),
            rotY,
            lit,
            nightAt: lit ? 0 : rng() < 0.55 ? 0.15 + rng() * 0.65 : Infinity,
            baseGray: 0.85 + rng() * 0.3,
          })
        }
      }
      // a street door per face, off-centre; a third of them get a cloth awning
      const doorAlong = (rng() - 0.5) * (longSpan - 3)
      const doorPos = alongX
        ? new Vector3(b.x + doorAlong, 1.12, b.z + side * (offset + 0.015))
        : new Vector3(b.x + side * (offset + 0.015), 1.12, b.z + doorAlong)
      doorSlots.push({ pos: doorPos, rotY, shade: 0.55 + rng() * 0.45 })
      if (!sparse && rng() < 0.32) {
        awningSlots.push({
          pos: doorPos.clone().setY(2.55),
          rotY,
          hue: rng(),
        })
      }
    }
  }

  houses.forEach((house) => {
    const eave = eaveHeight(house)
    matrix.compose(new Vector3(house.x, 0, house.z), quat, new Vector3(house.w, eave, house.d))
    if (isBrick(house.tint)) {
      brickBodies.setMatrixAt(brickCount, matrix)
      // bricks keep their own color; jitter brightness only
      color.setHSL(0.07, 0.2, 0.72 + (house.tint % 0.18) * 1.2)
      brickBodies.setColorAt(brickCount, color)
      brickCount++
    } else {
      plasterBodies.setMatrixAt(plasterCount, matrix)
      // light tints so the weathered plaster texture shows through: cream, tan, pale ochre
      color.setHSL(
        0.07 + house.tint * 0.06,
        0.15 + house.tint * 0.12,
        0.82 + (house.tint % 0.31) * 0.55,
      )
      plasterBodies.setColorAt(plasterCount, color)
      plasterCount++
    }
    placeRoof(house, eave)
    placeOpenings(house, eave, false)
  })

  warehouses.forEach((wh) => {
    const eave = eaveHeight(wh)
    matrix.compose(new Vector3(wh.x, 0, wh.z), quat, new Vector3(wh.w, eave, wh.d))
    stoneBodies.setMatrixAt(stoneCount, matrix)
    color.setHSL(0.08, 0.06, 0.62 + (wh.tint % 0.2))
    stoneBodies.setColorAt(stoneCount, color)
    stoneCount++
    placeRoof(wh, eave)
    placeOpenings(wh, eave, true)
  })

  plasterBodies.count = plasterCount
  brickBodies.count = brickCount
  stoneBodies.count = stoneCount
  terraRoofs.count = terraCount
  slateRoofs.count = slateCount
  scene.add(plasterBodies, brickBodies, stoneBodies, terraRoofs, slateRoofs)

  // photo window texture: neutral tint reads as dark glass, overbright warm tint as
  // lamplight. Under the cavern the lit windows ARE the vista — they pierce the fog.
  const windows = new InstancedMesh(
    new PlaneGeometry(1.2, 1.6),
    new MeshBasicMaterial({ map: tex('/textures/window.png'), side: DoubleSide, fog: !arena.cavern }),
    windowSlots.length,
  )
  const slotQuat = new Quaternion()
  windowSlots.forEach((slot, i) => {
    slotQuat.setFromAxisAngle(new Vector3(0, 1, 0), slot.rotY)
    matrix.compose(slot.pos, slotQuat, new Vector3(1, 1, 1))
    windows.setMatrixAt(i, matrix)
  })
  scene.add(windows)

  // plank doors and tilted cloth awnings dress the street level
  const doors = new InstancedMesh(
    new PlaneGeometry(1.35, 2.25),
    new MeshStandardMaterial({ map: tex('/textures/planks.jpg', 0.6, 1), roughness: 0.9 }),
    doorSlots.length,
  )
  doorSlots.forEach((slot, i) => {
    slotQuat.setFromAxisAngle(new Vector3(0, 1, 0), slot.rotY)
    matrix.compose(slot.pos, slotQuat, new Vector3(1, 1, 1))
    doors.setMatrixAt(i, matrix)
    color.setScalar(slot.shade)
    doors.setColorAt(i, color)
  })
  scene.add(doors)

  const awningGeometry = new PlaneGeometry(1.9, 1.2)
  awningGeometry.rotateX(-0.6) // pitched out from the facade
  // after the pitch, slide the cloth so its TOP edge sits on the wall plane
  awningGeometry.translate(0, 0, Math.sin(0.6) * 0.6)
  const awnings = new InstancedMesh(
    awningGeometry,
    new MeshStandardMaterial({
      map: tex('/textures/linen.jpg', 1.2, 0.9),
      roughness: 1,
      side: DoubleSide,
    }),
    awningSlots.length,
  )
  awningSlots.forEach((slot, i) => {
    slotQuat.setFromAxisAngle(new Vector3(0, 1, 0), slot.rotY)
    matrix.compose(slot.pos, slotQuat, new Vector3(1, 1, 1))
    awnings.setMatrixAt(i, matrix)
    // market cloth: wine red, moss green, ochre — sun-bleached so it reads as fabric
    color.setHSL(slot.hue < 0.4 ? 0.0 : slot.hue < 0.7 ? 0.28 : 0.09, 0.28, 0.36)
    awnings.setColorAt(i, color)
  })
  scene.add(awnings)

  const setNight = (night: number): void => {
    windowSlots.forEach((slot, i) => {
      if (night >= slot.nightAt) {
        // overbright warm glow through the glass, stronger against dark streets
        color.setRGB(2.4, 1.9, 1.1).multiplyScalar(1 + 0.45 * night)
      } else {
        // unlit glass is MeshBasicMaterial: it must darken by hand or it would
        // shine full-bright at midnight
        color.setScalar(slot.baseGray * (1 - 0.8 * night))
      }
      windows.setColorAt(i, color)
    })
    if (windows.instanceColor) windows.instanceColor.needsUpdate = true
  }
  setNight(0)
  return setNight
}

/** Towers, the cathedral, the gatehouse (with its sealed gate) and the wall bastions. */
function addLandmarks(scene: Scene, arena: Arena): void {
  const stone = new MeshStandardMaterial({
    map: tex('/textures/wall.jpg', 2, 4),
    roughness: 0.9,
  })
  const slate = new MeshStandardMaterial({
    map: tex('/textures/roof_slate.jpg', 2, 2),
    color: 0x9aa2ac,
    roughness: 0.7,
  })

  for (const b of arena.buildings) {
    if (
      b.kind !== 'tower' &&
      b.kind !== 'cathedral' &&
      b.kind !== 'gatehouse' &&
      b.kind !== 'bastion'
    )
      continue
    const bodyH = eaveHeight(b)
    const body = new Mesh(new BoxGeometry(b.w, bodyH, b.d), stone)
    body.position.set(b.x, bodyH / 2, b.z)
    // the cathedral flies an eight-sided spire; everything else keeps the squat pyramid
    const sides = b.kind === 'cathedral' ? 8 : 4
    const spire = new Mesh(new ConeGeometry(b.w * 0.72, b.h - bodyH, sides), slate)
    spire.position.set(b.x, bodyH + (b.h - bodyH) / 2, b.z)
    spire.rotation.y = Math.PI / 4
    body.castShadow = spire.castShadow = true
    body.receiveShadow = true
    scene.add(body, spire)
  }

  // no sealed gate down here: the Underground's gateAngle marks the surface stairway
  if (arena.cavern) return

  // the sealed main gate: a stone gate block set into the wall between the towers,
  // framing a pair of recessed plank door leaves under a stone lintel
  const gate = new Group()
  const blockStone = new MeshStandardMaterial({
    map: tex('/textures/wall.jpg', 3, 3),
    normalMap: tex('/textures/wall_nor.jpg', 3, 3, false),
    roughness: 1,
  })
  const R = arena.wallRadius
  const block = new Mesh(new BoxGeometry(6, 22, 14), blockStone)
  block.position.set(R + 1, 11, 0)
  gate.add(block)
  const leafMatDoor = new MeshStandardMaterial({
    map: tex('/textures/planks.jpg', 1.4, 3),
    roughness: 0.95,
  })
  for (const side of [-1, 1]) {
    const leaf = new Mesh(new BoxGeometry(0.8, 13, 4.4), leafMatDoor)
    leaf.position.set(R - 2.4, 6.5, side * 2.3)
    gate.add(leaf)
    const jamb = new Mesh(new BoxGeometry(1.2, 15, 1.4), blockStone)
    jamb.position.set(R - 2.3, 7.5, side * 5.3)
    gate.add(jamb)
  }
  const lintel = new Mesh(new BoxGeometry(1.4, 2.4, 12), blockStone)
  lintel.position.set(R - 2.3, 14.4, 0)
  gate.add(lintel)
  gate.rotation.y = -arena.gateAngle
  gate.traverse((obj) => {
    if (obj instanceof Mesh) obj.castShadow = obj.receiveShadow = true
  })
  scene.add(gate)
}

/** All the small solids, instanced per kind. Every surface is a sourced texture. */
function addProps(scene: Scene, arena: Arena): void {
  const by = (kind: Building['kind']): Building[] =>
    arena.buildings.filter((b) => b.kind === kind)
  const chimneys = by('chimney')
  const flagpoles = by('flagpole')
  const wells = by('well')
  const stalls = by('stall')
  const carts = by('cart')
  const piers = by('pier')
  const decks = by('deck')

  const matrix = new Matrix4()
  const quat = new Quaternion()
  const turned = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2)
  const color = new Color()
  const rng = createRng(0x9a0b5)
  const boxUp = new BoxGeometry(1, 1, 1)
  boxUp.translate(0, 0.5, 0)

  // chimneys: brick perches poking through the rooflines
  const chimneyMesh = new InstancedMesh(
    boxUp,
    new MeshStandardMaterial({ map: tex('/textures/brick.jpg', 1, 1), roughness: 1 }),
    chimneys.length,
  )
  chimneys.forEach((c, i) => {
    const visible = 3.2 // tail buried in the roof below
    matrix.compose(new Vector3(c.x, c.h - visible, c.z), quat, new Vector3(c.w, visible, c.d))
    chimneyMesh.setMatrixAt(i, matrix)
    color.setHSL(0.05, 0.25, 0.5 + rng() * 0.2)
    chimneyMesh.setColorAt(i, color)
  })
  chimneyMesh.castShadow = true
  scene.add(chimneyMesh)

  // flagpoles: wooden masts with cloth colors per instance
  const poleMesh = new InstancedMesh(
    new CylinderGeometry(0.09, 0.13, 1, 6).translate(0, 0.5, 0),
    new MeshStandardMaterial({ map: tex('/textures/bark.jpg', 1, 3), roughness: 1 }),
    flagpoles.length,
  )
  const flagMesh = new InstancedMesh(
    new PlaneGeometry(2.6, 1.4).translate(1.3, 0, 0),
    new MeshStandardMaterial({
      map: tex('/textures/linen.jpg', 1.5, 1),
      roughness: 1,
      side: DoubleSide,
    }),
    flagpoles.length,
  )
  flagpoles.forEach((p, i) => {
    const visible = Math.min(9, p.h - p.y0)
    matrix.compose(new Vector3(p.x, p.h - visible, p.z), quat, new Vector3(1, visible, 1))
    poleMesh.setMatrixAt(i, matrix)
    const flagQuat = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), rng() * Math.PI * 2)
    matrix.compose(new Vector3(p.x, p.h - 0.9, p.z), flagQuat, new Vector3(1, 1, 1))
    flagMesh.setMatrixAt(i, matrix)
    // garrison colors: survey green, wine, and undyed linen
    const roll = rng()
    if (roll < 0.5) color.setHSL(0.33, 0.35, 0.32)
    else if (roll < 0.75) color.setHSL(0.99, 0.4, 0.35)
    else color.setHSL(0.1, 0.25, 0.75)
    flagMesh.setColorAt(i, color)
  })
  scene.add(poleMesh, flagMesh)

  // wells: a stone ring under a little roofed frame
  const wellRing = new InstancedMesh(
    new CylinderGeometry(1.15, 1.3, 1.15, 10, 1, true).translate(0, 0.575, 0),
    new MeshStandardMaterial({ map: tex('/textures/wall.jpg', 2, 0.5), roughness: 1, side: DoubleSide }),
    wells.length,
  )
  const wellRoof = new InstancedMesh(
    gablePrismGeometry(),
    new MeshStandardMaterial({ map: tex('/textures/roof.jpg', 1, 1), roughness: 0.9 }),
    wells.length,
  )
  const wellPost = new InstancedMesh(
    new BoxGeometry(0.14, 1, 0.14).translate(0, 0.5, 0),
    new MeshStandardMaterial({ map: tex('/textures/planks.jpg', 0.3, 1), roughness: 1 }),
    wells.length * 2,
  )
  wells.forEach((w, i) => {
    matrix.compose(new Vector3(w.x, 0, w.z), quat, new Vector3(1, 1, 1))
    wellRing.setMatrixAt(i, matrix)
    matrix.compose(new Vector3(w.x, 2.3, w.z), quat, new Vector3(2.6, 0.9, 2))
    wellRoof.setMatrixAt(i, matrix)
    for (const side of [-1, 1]) {
      matrix.compose(new Vector3(w.x + side * 1.1, 0, w.z), quat, new Vector3(1, 2.4, 1))
      wellPost.setMatrixAt(i * 2 + (side + 1) / 2, matrix)
    }
  })
  scene.add(wellRing, wellRoof, wellPost)

  // market stalls: plank counters under tilted cloth awnings, held up by corner poles
  const stallCounter = new InstancedMesh(
    boxUp,
    new MeshStandardMaterial({ map: tex('/textures/planks.jpg', 1, 0.5), roughness: 1 }),
    stalls.length,
  )
  const stallAwning = new InstancedMesh(
    new PlaneGeometry(1, 1),
    new MeshStandardMaterial({
      map: tex('/textures/linen.jpg', 1.3, 1),
      roughness: 1,
      side: DoubleSide,
    }),
    stalls.length,
  )
  const stallPole = new InstancedMesh(
    new BoxGeometry(0.14, 1, 0.14).translate(0, 0.5, 0),
    new MeshStandardMaterial({ map: tex('/textures/planks.jpg', 0.3, 1), roughness: 1 }),
    stalls.length * 4,
  )
  stalls.forEach((s, i) => {
    matrix.compose(new Vector3(s.x, 0, s.z), quat, new Vector3(s.w, 0.95, s.d))
    stallCounter.setMatrixAt(i, matrix)
    // lay the cloth nearly flat, pitched a touch so it sheds rain toward the street
    const tilt = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2 + 0.28)
    if (s.ridgeAxis === 'z') tilt.premultiply(turned)
    matrix.compose(new Vector3(s.x, s.h, s.z), tilt, new Vector3(s.w + 0.5, s.d + 0.6, 1))
    stallAwning.setMatrixAt(i, matrix)
    color.setHSL(rng() < 0.5 ? 0.0 : 0.32, 0.28, 0.35 + rng() * 0.12)
    stallAwning.setColorAt(i, color)
    // four corner poles carry the cloth: no more hovering rooftops
    let corner = 0
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        matrix.compose(
          new Vector3(s.x + sx * (s.w / 2 - 0.12), 0, s.z + sz * (s.d / 2 - 0.12)),
          quat,
          new Vector3(1, s.h + (sz < 0 ? 0.12 : -0.22), 1),
        )
        stallPole.setMatrixAt(i * 4 + corner, matrix)
        corner++
      }
    }
  })
  stallCounter.castShadow = true
  scene.add(stallCounter, stallAwning, stallPole)

  // hand carts left in the squares
  const cartBody = new InstancedMesh(
    boxUp,
    new MeshStandardMaterial({ map: tex('/textures/planks.jpg', 1, 0.4), roughness: 1 }),
    carts.length,
  )
  const cartWheel = new InstancedMesh(
    new CylinderGeometry(0.5, 0.5, 0.12, 10).rotateZ(Math.PI / 2),
    new MeshStandardMaterial({ map: tex('/textures/bark.jpg', 0.5, 0.5), roughness: 1 }),
    carts.length * 2,
  )
  carts.forEach((c, i) => {
    matrix.compose(new Vector3(c.x, 0.35, c.z), quat, new Vector3(c.w, 0.9, c.d))
    cartBody.setMatrixAt(i, matrix)
    color.setHSL(0.08, 0.2, 0.4 + rng() * 0.25)
    cartBody.setColorAt(i, color)
    const axleAlongX = c.d > c.w // wheels sit on the long sides
    for (const side of [-1, 1]) {
      const wq = axleAlongX ? quat : turned
      matrix.compose(
        axleAlongX
          ? new Vector3(c.x + side * (c.w / 2 + 0.08), 0.5, c.z)
          : new Vector3(c.x, 0.5, c.z + side * (c.d / 2 + 0.08)),
        wq,
        new Vector3(1, 1, 1),
      )
      cartWheel.setMatrixAt(i * 2 + (side + 1) / 2, matrix)
    }
  })
  scene.add(cartBody, cartWheel)

  // bridges and the gate span: stone piers, stone decks, low parapets
  const stoneMat = new MeshStandardMaterial({
    map: tex('/textures/wall.jpg', 5, 1.4),
    normalMap: tex('/textures/wall_nor.jpg', 5, 1.4, false),
    roughness: 1,
  })
  const pierMesh = new InstancedMesh(boxUp, stoneMat, piers.length)
  piers.forEach((p, i) => {
    matrix.compose(new Vector3(p.x, p.y0, p.z), quat, new Vector3(p.w, p.h - p.y0, p.d))
    pierMesh.setMatrixAt(i, matrix)
  })
  pierMesh.castShadow = pierMesh.receiveShadow = true
  scene.add(pierMesh)

  const deckMesh = new InstancedMesh(boxUp, stoneMat, decks.length)
  const parapetMesh = new InstancedMesh(boxUp, stoneMat, decks.length * 2)
  // a plank walkway laid over the stone: the crossing reads as a path, not a slab
  const walkwayMesh = new InstancedMesh(
    new PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    new MeshStandardMaterial({ map: tex('/textures/planks.jpg', 5, 2), roughness: 1 }),
    decks.length,
  )
  decks.forEach((d, i) => {
    matrix.compose(new Vector3(d.x, d.y0, d.z), quat, new Vector3(d.w, d.h - d.y0, d.d))
    deckMesh.setMatrixAt(i, matrix)
    matrix.compose(new Vector3(d.x, d.h + 0.03, d.z), quat, new Vector3(d.w - 0.5, 1, d.d - 1.1))
    walkwayMesh.setMatrixAt(i, matrix)
    for (const side of [-1, 1]) {
      matrix.compose(
        new Vector3(d.x, d.h, d.z + side * (d.d / 2 - 0.22)),
        quat,
        new Vector3(d.w, 0.65, 0.35),
      )
      parapetMesh.setMatrixAt(i * 2 + (side + 1) / 2, matrix)
    }
  })
  deckMesh.castShadow = deckMesh.receiveShadow = true
  walkwayMesh.receiveShadow = true
  scene.add(deckMesh, parapetMesh, walkwayMesh)
}

/** Linen banner lines strung between facing houses across the narrow streets. */
function addBanners(scene: Scene, arena: Arena): void {
  const rng = createRng(0xba22e5)
  const slots: Array<{ x: number; z: number; y: number; alongX: boolean }> = []
  for (let attempt = 0; attempt < 240 && slots.length < 36; attempt++) {
    // streets run along the block boundaries at multiples of BLOCK
    const k = Math.floor(rng() * 15) - 7
    const along = (rng() * 2 - 1) * (arena.wallRadius - 30)
    const alongX = rng() < 0.5
    const x = alongX ? along : k * BLOCK
    const z = alongX ? k * BLOCK : along
    if (Math.hypot(x, z) < arena.plazaRadius + 8) continue
    const sideA = groundHeightAt(arena, alongX ? x : x - 4, alongX ? z - 4 : z, Infinity)
    const sideB = groundHeightAt(arena, alongX ? x : x + 4, alongX ? z + 4 : z, Infinity)
    if (sideA < 9 || sideB < 9) continue // both flanks need houses to anchor the line
    slots.push({ x, z, y: 6.2 + rng() * 2.2, alongX })
  }
  if (slots.length === 0) return

  const banner = new InstancedMesh(
    new PlaneGeometry(8, 0.6),
    new MeshStandardMaterial({
      map: tex('/textures/linen.jpg', 4, 0.4),
      roughness: 1,
      side: DoubleSide,
    }),
    slots.length,
  )
  const matrix = new Matrix4()
  const q = new Quaternion()
  const color = new Color()
  slots.forEach((slot, i) => {
    q.setFromAxisAngle(new Vector3(0, 1, 0), slot.alongX ? Math.PI / 2 : 0)
    matrix.compose(new Vector3(slot.x, slot.y, slot.z), q, new Vector3(1, 1, 1))
    banner.setMatrixAt(i, matrix)
    color.setHSL(rng() < 0.5 ? 0.33 : rng() < 0.5 ? 0.99 : 0.12, 0.35, 0.38 + rng() * 0.2)
    banner.setColorAt(i, color)
  })
  scene.add(banner)
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
    new MeshStandardMaterial({ map: tex('/textures/wall.jpg', 60, 1), roughness: 1 }),
  )
  rim.rotation.x = Math.PI / 2
  rim.position.y = arena.wallHeight
  scene.add(rim)
}

function addStation(scene: Scene, arena: Arena): void {
  // one shared material set; the plaza pole and its cardinal siblings all read alike
  const poleMat = new MeshStandardMaterial({ map: tex('/textures/bark.jpg', 1, 4), roughness: 0.9 })
  const bannerMat = new MeshStandardMaterial({
    map: tex('/textures/linen.jpg', 1.4, 1),
    color: 0x53b06e,
    emissive: 0x1d5c38,
    emissiveIntensity: 0.12,
    side: DoubleSide,
  })
  const ringMat = new MeshStandardMaterial({
    color: 0x2fa35f,
    emissive: 0x2fa35f,
    emissiveIntensity: 0.8,
    transparent: true,
    opacity: 0.55,
  })
  for (const station of arena.stations) {
    const pole = new Mesh(new CylinderGeometry(0.35, 0.35, 16, 8), poleMat)
    pole.position.set(station.x, 8, station.z)
    pole.castShadow = true

    const banner = new Mesh(new BoxGeometry(4.5, 3, 0.15), bannerMat)
    banner.position.set(station.x, 13.5, station.z)
    // cardinal banners face the plaza so the green reads on approach from the center
    banner.rotation.y = Math.atan2(station.x, station.z) + Math.PI

    const ring = new Mesh(new RingGeometry(8.6, 10, 48).rotateX(-Math.PI / 2), ringMat)
    ring.position.set(station.x, 0.08, station.z)
    scene.add(pole, banner, ring)
  }
}

/** Clouds, birds, trees and a mountain ring: motion and depth beyond the gameplay set. */
function addScenery(
  scene: Scene,
  arena: Arena,
): { update: (dt: number, camera?: Object3D) => void; setNight: (night: number) => void } {
  const rng = createRng(0x5eed)
  const clouds = new Group()
  scene.add(clouds)

  // realistic cloud billboards (CC0 transparent renders); faced to the camera each frame
  const cloudGeometry = new PlaneGeometry(1, 1)
  const cloudBillboards: Mesh[] = []
  const cloudMats: MeshBasicMaterial[] = []
  for (let i = 0; i < 10; i++) {
    const material = new MeshBasicMaterial({
      map: tex(i % 2 === 0 ? '/textures/cloud1.png' : '/textures/cloud2.png'),
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      fog: false,
    })
    cloudMats.push(material)
    const cloud = new Mesh(cloudGeometry, material)
    const radius = 90 + rng() * 260
    const angle = rng() * Math.PI * 2
    cloud.position.set(Math.cos(angle) * radius, 130 + rng() * 70, Math.sin(angle) * radius)
    const size = 60 + rng() * 60
    cloud.scale.set(size, size * 0.55, 1)
    cloudBillboards.push(cloud)
    clouds.add(cloud)
  }

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
  while (placed < 56 && attempts < 700) {
    attempts++
    const angle = rng() * Math.PI * 2
    const radius = arena.plazaRadius + 12 + rng() * (arena.wallRadius - arena.plazaRadius - 30)
    const x = Math.cos(angle) * radius
    const z = Math.sin(angle) * radius
    if (groundHeightAt(arena, x, z, 0) !== 0 || baseGroundY(arena, x, z) !== 0) continue
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
  const birds: Array<{
    mesh: Mesh
    radius: number
    angle: number
    speed: number
    y: number
    phase: number
  }> = []
  for (let i = 0; i < 11; i++) {
    const mesh = new Mesh(birdGeometry, birdMat)
    mesh.scale.setScalar(0.9 + rng() * 0.7)
    const bird = {
      mesh,
      radius: 40 + rng() * 160,
      angle: rng() * Math.PI * 2,
      speed: 0.08 + rng() * 0.12,
      y: 55 + rng() * 45,
      phase: rng() * Math.PI * 2,
    }
    birds.push(bird)
    scene.add(mesh)
  }

  // cloud quads are unlit; without a hand dimmer they would stay noon-white at midnight
  const setNight = (night: number): void => {
    for (const material of cloudMats) {
      material.color.setScalar(1 - 0.85 * night)
      material.opacity = 0.85 - 0.35 * night
    }
  }

  let time = 0
  const update = (dt: number, camera?: Object3D) => {
    time += dt
    clouds.rotation.y += dt * 0.004
    if (camera) {
      for (const cloud of cloudBillboards) {
        cloud.quaternion.copy(camera.quaternion)
      }
    }
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
  return { update, setNight }
}

export type SceneRoot = Object3D
