import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Euler,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  PointLight,
  Points,
  PointsMaterial,
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

/**
 * The Underground's renderer half (IDEAS look spec, 2026-07-13): a rock dome over a
 * torchlit bowl. The dome is cut open at every shaft, so the real sky — sun, moon and
 * stars, driven by the same seeded clock as the surface — shows through the holes, and
 * the daylight spilling down them is what keeps the soldier off the flashlight by day.
 * The dome samples the SAME paraboloid the sim raycasts, so hooks anchor on visible rock.
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

/** Loose stones strewn across the cavern floor. */
const RUBBLE_COUNT = 900
/** Metres of dirt per texture tile: tight enough that the lamp rakes real grain. */
const DIRT_TILE = 3.5
/** Ruffle amplitude. Upward-only: a dip would open a gap under every house. */
const RUFFLE = 0.75
/** Real lights alive at once; every other fire is emissive geometry. */
const LIGHT_POOL = 10
const TORCH_HEIGHT = 3.1
/** Billboard puffs per flame, and how fast one lives its life (slow: fire, not a strobe). */
const FLAME_PUFFS = 3
const FLAME_SPEED = 0.42
const TORCH_INTENSITY = 90
const SHAFT_INTENSITY = 950

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

/** A soft radial blob: the halo around a flame, and the haze in a sunbeam. */
function glowTexture(): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 64
  const ctx = canvas.getContext('2d')!
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, 'rgba(255,244,214,1)')
  grad.addColorStop(0.35, 'rgba(255,168,64,0.72)')
  grad.addColorStop(1, 'rgba(255,110,20,0)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, 64, 64)
  return new CanvasTexture(canvas)
}

/**
 * The lights of the Underground, and the life in them.
 *
 * Torches burn on posts down every street and daylight pours through the shafts, but a
 * hundred real lights would melt a forward renderer. So every fire is cheap emissive
 * geometry, and a small POOL of real PointLights is re-homed each frame onto whichever
 * sources are nearest the soldier: ten lights buy the whole cavern.
 */
class CavernLights {
  private readonly sources: { x: number; y: number; z: number; torch: boolean; phase: number }[] = []
  private readonly pool: PointLight[] = []
  private readonly fire: InstancedMesh
  private readonly torchCount: number
  private readonly beams: { mat: MeshBasicMaterial; base: number }[] = []
  private readonly pools: { mat: MeshBasicMaterial; base: number }[] = []
  private readonly caps: MeshBasicMaterial[] = []
  private readonly capDay = new Color(0xffffff)
  private readonly capNight = new Color(0x6d80a8)
  private readonly glowMat: PointsMaterial
  private readonly matrix = new Matrix4()
  private readonly quat = new Quaternion()
  private readonly scale = new Vector3()
  private readonly at = new Vector3()
  private night = 1
  private time = 0

  constructor(scene: Scene, arena: Arena) {
    const cavern = arena.cavern!
    const torches = cavern.torches
    this.torchCount = torches.length

    // posts and iron cups: sourced textures, per the texture rule
    const woodMat = new MeshStandardMaterial({
      map: tex('/textures/bark.jpg', 1, 3),
      roughness: 0.95,
    })
    const ironMat = new MeshStandardMaterial({
      map: tex('/textures/metal.jpg', 1, 1),
      color: 0x6a6a70,
      roughness: 0.6,
    })
    const postGeo = new CylinderGeometry(0.11, 0.16, TORCH_HEIGHT, 6)
    postGeo.translate(0, TORCH_HEIGHT / 2, 0)
    const cupGeo = new CylinderGeometry(0.34, 0.17, 0.5, 8)
    cupGeo.translate(0, TORCH_HEIGHT + 0.2, 0)
    const count = Math.max(1, torches.length)
    const posts = new InstancedMesh(postGeo, woodMat, count)
    const cups = new InstancedMesh(cupGeo, ironMat, count)

    // the flame: billboard puffs of fire, built the way the Colossus's steam aura is —
    // sourced sprite, drifting slowly, no hard geometry. Three puffs rise, swell and fade
    // through each torch on staggered phases, so the fire breathes instead of buzzing.
    this.fire = new InstancedMesh(
      new PlaneGeometry(1, 1),
      new MeshBasicMaterial({
        // Kenney's particle sprites are white masks made to be tinted: this is the fire
        map: tex('/textures/fire.png', 1, 1),
        color: 0xff8324,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        blending: AdditiveBlending,
        fog: false,
      }),
      count * FLAME_PUFFS,
    )
    this.fire.frustumCulled = false

    const rng = createRng(0xf1a3)
    const glowPos = new Float32Array(count * 3)
    torches.forEach((t, i) => {
      this.at.set(t.x, 0, t.z)
      this.matrix.compose(this.at, this.quat, new Vector3(1, 1, 1))
      posts.setMatrixAt(i, this.matrix)
      cups.setMatrixAt(i, this.matrix)
      glowPos[i * 3] = t.x
      glowPos[i * 3 + 1] = TORCH_HEIGHT + 0.55
      glowPos[i * 3 + 2] = t.z
      this.sources.push({
        x: t.x,
        y: TORCH_HEIGHT + 0.5,
        z: t.z,
        torch: true,
        phase: rng() * Math.PI * 2,
      })
    })
    scene.add(posts, cups, this.fire)

    // one Points draw call carries every flame's halo, and points always face the camera
    const glowGeo = new BufferGeometry()
    glowGeo.setAttribute('position', new BufferAttribute(glowPos, 3))
    this.glowMat = new PointsMaterial({
      map: glowTexture(),
      size: 2.4,
      transparent: true,
      opacity: 0.85,
      blending: AdditiveBlending,
      depthWrite: false,
      fog: false,
    })
    const glow = new Points(glowGeo, this.glowMat)
    glow.frustumCulled = false
    scene.add(glow)

    // the shafts: a hazy beam through the hole and a pool of light on the dirt below
    const hazeTex = glowTexture()
    for (const shaft of cavern.shafts) {
      const ceilY = ceilingHeightAt(arena, shaft.x, shaft.z)
      const beamMat = new MeshBasicMaterial({
        color: 0xffedc2,
        transparent: true,
        opacity: 0.05,
        blending: AdditiveBlending,
        depthWrite: false,
        side: BackSide, // the inner face only: DoubleSide made the haze pay twice per pixel
        fog: false,
      })
      const beam = new Mesh(
        new CylinderGeometry(shaft.radius * 0.9, shaft.radius * 1.55, ceilY, 20, 1, true),
        beamMat,
      )
      beam.position.set(shaft.x, ceilY / 2, shaft.z)
      scene.add(beam)
      this.beams.push({ mat: beamMat, base: 0.05 })

      // the surface, seen from below: a plate of blown-out white light capping the hole.
      // Deliberately NOT the sky — no clouds, no stars, no weather; just the glare of a
      // world you cannot reach. It dims to a cold sliver when the sun is down.
      const capMat = new MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 1,
        depthWrite: false,
        fog: false,
        side: DoubleSide,
      })
      // The plate hangs OVER the rock, not under it, and is far wider than the hole.
      // Sight-lines through an opening leave it at every angle — a small plate tucked just
      // inside the rim ducks out of view at a shallow angle and the hole reads as a black
      // pit with a white lip. Wide and above, the opening is full of light from anywhere in
      // the cavern, and the rock hides the plate's edges from everywhere else.
      let highestRim = ceilY
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2
        highestRim = Math.max(
          highestRim,
          ceilingHeightAt(
            arena,
            shaft.x + Math.cos(a) * shaft.radius,
            shaft.z + Math.sin(a) * shaft.radius,
          ),
        )
      }
      const cap = new Mesh(new CircleGeometry(shaft.radius * 3, 32), capMat)
      cap.rotation.x = Math.PI / 2 // faces down into the cavern
      cap.position.set(shaft.x, highestRim + 1.2, shaft.z)
      scene.add(cap)
      this.caps.push(capMat)

      const poolMat = new MeshBasicMaterial({
        map: hazeTex,
        color: 0xffe9b8,
        transparent: true,
        opacity: 0.55,
        blending: AdditiveBlending,
        depthWrite: false,
        fog: false,
      })
      const pool = new Mesh(new CircleGeometry(shaft.radius * 2, 24), poolMat)
      pool.rotation.x = -Math.PI / 2
      pool.position.set(shaft.x, 0.09, shaft.z)
      scene.add(pool)
      this.pools.push({ mat: poolMat, base: 0.55 })

      // a light hung in the opening: a real lamp at noon, snuffed out at midnight
      this.sources.push({ x: shaft.x, y: ceilY - 2, z: shaft.z, torch: false, phase: 0 })
    }

    for (let i = 0; i < LIGHT_POOL; i++) {
      const light = new PointLight(0xffa04a, 0, 44, 1.7)
      light.visible = false
      scene.add(light)
      this.pool.push(light)
    }
    this.setNight(1)
  }

  /** Registered with the sky: 0 in full day, 1 in full night. */
  setNight = (night: number): void => {
    this.night = night
    const day = 1 - night
    // the shafts blaze at noon and all but shut at midnight (a little moonlight stays)
    for (const beam of this.beams) beam.mat.opacity = beam.base * (0.12 + 0.88 * day)
    for (const p of this.pools) p.mat.opacity = p.base * (0.06 + 0.94 * day)
    // white glare by day, a cold dim plate by night — never a picture of the sky
    for (const cap of this.caps) {
      cap.color.copy(this.capNight).lerp(this.capDay, day)
      cap.opacity = 0.35 + 0.65 * day
    }
    // fires read as fires against the dark; at noon they stop blowing out the frame
    this.glowMat.opacity = 0.42 + 0.48 * night
  }

  update(dt: number, camera?: Object3D): void {
    this.time += dt
    const day = 1 - this.night

    // the puffs face the camera, exactly as a Sprite would, but in one instanced draw
    if (camera) this.quat.copy(camera.quaternion)

    for (let i = 0; i < this.torchCount; i++) {
      const src = this.sources[i]!
      for (let p = 0; p < FLAME_PUFFS; p++) {
        // each puff walks its own slow 0..1 life: born in the cup, rising, swelling, gone
        const life = (this.time * FLAME_SPEED + src.phase + p / FLAME_PUFFS) % 1
        const rise = life * 0.62
        const swell = 0.55 + life * 0.85
        // it thins out as it climbs, so the flame tapers instead of ending in a wall
        const fade = 1 - life * life
        this.at.set(src.x, TORCH_HEIGHT + 0.3 + rise, src.z)
        this.scale.set(swell * fade * 1.15, swell * (0.8 + fade * 0.7), 1)
        this.matrix.compose(this.at, this.quat, this.scale)
        this.fire.setMatrixAt(i * FLAME_PUFFS + p, this.matrix)
      }
    }
    this.fire.instanceMatrix.needsUpdate = true

    if (!camera) return
    // re-home the pooled lights onto the nearest sources: the cavern has a hundred fires,
    // but only the ones you are standing among need to be real lights
    const cam = camera.position
    const ranked = this.sources
      .map((src, index) => ({
        index,
        d2: (src.x - cam.x) ** 2 + (src.y - cam.y) ** 2 + (src.z - cam.z) ** 2,
      }))
      .sort((a, b) => a.d2 - b.d2)
      .slice(0, LIGHT_POOL)

    for (let i = 0; i < this.pool.length; i++) {
      const light = this.pool[i]!
      const pick = ranked[i]
      if (!pick) {
        light.visible = false
        continue
      }
      const src = this.sources[pick.index]!
      light.position.set(src.x, src.y, src.z)
      light.visible = true
      if (src.torch) {
        const flicker = 0.82 + 0.18 * Math.sin(this.time * 9.5 + src.phase)
        light.color.setHex(0xffa04a)
        light.intensity = TORCH_INTENSITY * flicker
        light.distance = 44
        light.decay = 1.7
      } else {
        // a shaft of daylight: cool, wide, and gone by night
        light.color.setHex(0xdfe6ff)
        light.intensity = SHAFT_INTENSITY * day
        light.distance = 140
        light.decay = 1.35
      }
    }
  }
}

/**
 * The dome, the perimeter rock, the pillars, the stalactites, the torches and the shafts.
 * Returns the per-frame updater plus the sky's night callback.
 */
export function addCavern(
  scene: Scene,
  arena: Arena,
): { update: (dt: number, camera?: Object3D) => void; setNight: (night: number) => void } {
  const cavern = arena.cavern!
  const R = arena.wallRadius

  const domeRock = new MeshStandardMaterial({
    map: tex('/textures/cave_rock.jpg', 14, 5),
    normalMap: tex('/textures/cave_rock_nor.jpg', 14, 5, false),
    color: 0xa39a90,
    roughness: 1,
    side: DoubleSide,
  })
  scene.add(new Mesh(cavernDome(arena), domeRock))

  // the perimeter: raw rock rising to meet the dome edge (no battlements down here)
  const wallRock = new MeshStandardMaterial({
    map: tex('/textures/cave_rock.jpg', 18, 2.2),
    normalMap: tex('/textures/cave_rock_nor.jpg', 18, 2.2, false),
    color: 0x6f6862, // the far rock recedes; ungraded it reads as a flat grey band
    roughness: 1,
    side: DoubleSide,
  })
  const wall = new Mesh(new CylinderGeometry(R + 2, R + 5, cavern.edgeY + 1, 64, 1, true), wallRock)
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

  const lights = new CavernLights(scene, arena)
  return { update: (dt, camera) => lights.update(dt, camera), setNight: lights.setNight }
}

/**
 * The ceiling: a polar grid sampled off the sim's paraboloid (`ceilingHeightAt` — the very
 * surface hooks anchor on) with the shaft quads left out, so every opening is a real hole.
 * You see the sky through it, the sun and the stars cross it, and you can swing up into it.
 */
function cavernDome(arena: Arena): BufferGeometry {
  const cavern = arena.cavern!
  const R = arena.wallRadius + 4
  const rings = 96
  const sectors = 220
  const positions: number[] = []
  const uvs: number[] = []

  /** Which opening (if any) swallows this point. */
  const shaftAt = (x: number, z: number): { x: number; z: number; radius: number } | undefined =>
    cavern.shafts.find((s) => Math.hypot(s.x - x, s.z - z) < s.radius)

  /**
   * A grid vertex, but any vertex that falls inside an opening is SHOVED OUT onto that
   * opening's rim. Quads straddling the edge then end exactly on the circle, so the hole
   * is round instead of the staircase a plain drop-the-quad cut leaves behind.
   */
  const at = (ri: number, si: number): [number, number, number, boolean] => {
    const r = (ri / rings) * R
    const a = (si / sectors) * Math.PI * 2
    let x = Math.cos(a) * r
    let z = Math.sin(a) * r
    const shaft = shaftAt(x, z)
    let inside = false
    if (shaft) {
      inside = true
      const dx = x - shaft.x
      const dz = z - shaft.z
      const d = Math.hypot(dx, dz)
      // dead centre has no direction to be pushed in; any radial will do
      const nx = d > 1e-6 ? dx / d : 1
      const nz = d > 1e-6 ? dz / d : 0
      x = shaft.x + nx * shaft.radius
      z = shaft.z + nz * shaft.radius
    }
    return [x, ceilingHeightAt(arena, x, z), z, inside]
  }

  for (let ri = 0; ri < rings; ri++) {
    for (let si = 0; si < sectors; si++) {
      const a = at(ri, si)
      const b = at(ri + 1, si)
      const c = at(ri + 1, si + 1)
      const d = at(ri, si + 1)
      // a quad whose every corner sat inside an opening is the opening: leave it out
      if (a[3] && b[3] && c[3] && d[3]) continue
      for (const v of [a, b, c, a, c, d]) {
        positions.push(v[0], v[1], v[2])
        uvs.push(v[0] / 42, v[2] / 42) // metric UVs: the rock tiles at a fixed scale
      }
    }
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2))
  geometry.computeVertexNormals()
  return geometry
}
