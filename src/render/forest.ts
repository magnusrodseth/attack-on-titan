import {
  AdditiveBlending,
  BackSide,
  BoxGeometry,
  BufferAttribute,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  IcosahedronGeometry,
  InstancedMesh,
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
  SphereGeometry,
  Texture,
  TextureLoader,
  Vector2,
  Vector3,
} from 'three'
import type { Arena } from '../sim/city'
import { createRng } from '../sim/rng'

/**
 * The Forest of Giant Trees (IDEAS look spec, 2026-07-13). The read is SCALE: the trunks
 * are cliffs and the ordinary trees between them are the bushes that prove it. Everything
 * that matters to the sim — trunk, limb, sapling — is a real solid in `city.ts`, so what
 * you can see you can hook, land on and swing from; this module only dresses it, and adds
 * the crowns, the underbrush and the shafts of light, which nothing collides with anyway.
 */

const loader = new TextureLoader()

function tex(path: string, repeatX = 1, repeatY = 1, srgb = true): Texture {
  const texture = loader.load(path)
  if (srgb) texture.colorSpace = SRGBColorSpace
  texture.wrapS = texture.wrapT = RepeatWrapping
  texture.repeat.set(repeatX, repeatY)
  texture.anisotropy = 8 // the floor is always seen at a grazing angle
  return texture
}

/** Foliage pads sprouting off a giant, and the blobs that clump into its crown. */
const PADS_PER_GIANT = 4
const CROWN_BLOBS = 5
const FERN_COUNT = 1400

/**
 * Foliage is nearly always seen from BELOW — you are a soldier on the floor looking up at a
 * crown 70 m over your head, and the sun is on the far side of it. A plain lit material
 * therefore renders every crown as a black boulder. The emissive floor is what keeps a leaf
 * reading as a leaf in its own shade, and flat shading gives the low-poly blobs their facets.
 */
function foliageMaterial(repeat: number): MeshStandardMaterial {
  return new MeshStandardMaterial({
    map: tex('/textures/leaves.jpg', repeat, repeat),
    color: 0x86a95c,
    emissive: 0x24361b,
    roughness: 1,
    side: DoubleSide,
    flatShading: true,
  })
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

/**
 * The forest floor: leaf litter and dirt, gently heaved, with the clearing's meadow grass
 * laid over the middle. Upward-only ruffle, as in the cavern — a dip would open a gap under
 * every trunk, and the sim's ground is flat at y = 0 regardless.
 */
function addFloor(scene: Scene, arena: Arena): void {
  const R = arena.wallRadius + 40
  const litter = new MeshStandardMaterial({
    map: tex('/textures/forest_floor.jpg', 1, 1),
    normalMap: tex('/textures/forest_floor_nor.jpg', 1, 1, false),
    normalScale: new Vector2(1.8, 1.8),
    color: 0x8f9179, // graded green-grey: bare dirt reads too warm under a canopy
    roughness: 1,
  })

  const segments = 190
  const geometry = new PlaneGeometry(R * 2, R * 2, segments, segments)
  geometry.rotateX(-Math.PI / 2)
  const pos = geometry.attributes.position as BufferAttribute
  const uv = geometry.attributes.uv as BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const z = pos.getZ(i)
    const broad = valueNoise(x, z, 26, 0x1f3a)
    const fine = valueNoise(x, z, 5, 0x77c1)
    pos.setY(i, (broad * 0.7 + fine * 0.3) * 0.7)
    uv.setXY(i, x / 4, z / 4) // metric UVs: 4 m of floor per tile
  }
  geometry.computeVertexNormals()
  const floor = new Mesh(geometry, litter)
  floor.receiveShadow = true
  scene.add(floor)

  // the clearing: meadow grass where the crowns break and the light gets down
  const meadow = new Mesh(
    new CircleGeometry(arena.plazaRadius + 8, 48).rotateX(-Math.PI / 2),
    new MeshStandardMaterial({
      map: tex('/textures/meadow_grass.jpg', 14, 14),
      normalMap: tex('/textures/meadow_grass_nor.jpg', 14, 14, false),
      color: 0x9fb47c,
      roughness: 1,
    }),
  )
  meadow.position.y = 0.75 // just proud of the litter's ruffle, never fighting it
  meadow.receiveShadow = true
  scene.add(meadow)
}

/**
 * The giants. One instanced trunk with the sugi bark the anime's groves are drawn from,
 * plus a flared buttress skirt at the foot (the reference's flared roots) and a crown of
 * foliage. Per-instance tint and a rotation keep 150 clones from reading as clones.
 */
function addGiants(scene: Scene, arena: Arena): void {
  const giants = arena.buildings.filter((b) => b.kind === 'trunk')
  if (giants.length === 0) return

  const barkMat = new MeshStandardMaterial({
    map: tex('/textures/giant_bark.jpg', 3, 5),
    normalMap: tex('/textures/giant_bark_nor.jpg', 3, 5, false),
    normalScale: new Vector2(1.5, 1.5),
    emissive: 0x171009, // the deep shade between the giants never goes to pure black
    roughness: 1,
  })
  const leafMat = foliageMaterial(3)

  const matrix = new Matrix4()
  const quat = new Quaternion()
  const color = new Color()
  const scale = new Vector3()
  const at = new Vector3()
  const rng = createRng(0xf0e5)

  // the trunk: a tall taper. Slightly narrower at the crown than the sim's cylinder, which
  // is the honest reading — the hook grabs the widest part of the bark either way
  const trunkGeo = new CylinderGeometry(0.82, 1.04, 1, 14, 1)
  trunkGeo.translate(0, 0.5, 0)
  const trunks = new InstancedMesh(trunkGeo, barkMat, giants.length)

  // the buttress: a short, wide cone skirt where the roots flare into the floor
  const buttressGeo = new ConeGeometry(1, 1, 14, 1, true)
  buttressGeo.translate(0, 0.5, 0)
  const buttresses = new InstancedMesh(buttressGeo, barkMat, giants.length)

  // the crown: a CLUSTER of blobs, not one ball — a single sphere reads as a boulder on a
  // stick. Low-poly and flat-shaded, they clump into a canopy.
  const blobGeo = new IcosahedronGeometry(1, 1)
  const crowns = new InstancedMesh(blobGeo, leafMat, giants.length * CROWN_BLOBS)
  // the pads: umbrella foliage sprouting off the trunk at intervals (the reference's read)
  const pads = new InstancedMesh(blobGeo, leafMat, giants.length * PADS_PER_GIANT)

  giants.forEach((g, i) => {
    const radius = g.w / 2
    quat.setFromAxisAngle(new Vector3(0, 1, 0), rng() * Math.PI * 2)

    at.set(g.x, 0, g.z)
    scale.set(radius, g.h, radius)
    matrix.compose(at, quat, scale)
    trunks.setMatrixAt(i, matrix)
    color.setHSL(0.08, 0.22, 0.34 + g.tint * 0.14)
    trunks.setColorAt(i, color)

    const flare = 4 + g.tint * 3
    at.set(g.x, 0, g.z)
    scale.set(radius * 1.55, flare, radius * 1.55)
    matrix.compose(at, quat, scale)
    buttresses.setMatrixAt(i, matrix)
    color.setHSL(0.08, 0.2, 0.28 + g.tint * 0.12)
    buttresses.setColorAt(i, color)

    const crownR = radius * 2.6 + 5
    for (let c = 0; c < CROWN_BLOBS; c++) {
      const angle = rng() * Math.PI * 2
      const spread = crownR * (0.2 + rng() * 0.75)
      const blob = crownR * (0.5 + rng() * 0.45)
      at.set(
        g.x + Math.cos(angle) * spread,
        g.h - 2 + rng() * crownR * 0.6,
        g.z + Math.sin(angle) * spread,
      )
      scale.set(blob, blob * (0.55 + rng() * 0.3), blob)
      matrix.compose(at, quat, scale)
      crowns.setMatrixAt(i * CROWN_BLOBS + c, matrix)
      color.setHSL(0.23 + rng() * 0.05, 0.34, 0.3 + rng() * 0.16)
      crowns.setColorAt(i * CROWN_BLOBS + c, color)
    }

    for (let p = 0; p < PADS_PER_GIANT; p++) {
      const angle = rng() * Math.PI * 2
      const y = g.h * (0.42 + (p / PADS_PER_GIANT) * 0.45 + rng() * 0.05)
      const reach = radius + 3 + rng() * 5
      const padR = 6 + rng() * 7
      at.set(g.x + Math.cos(angle) * reach, y, g.z + Math.sin(angle) * reach)
      scale.set(padR, padR * 0.38, padR) // squashed: an umbrella, not a ball
      matrix.compose(at, quat, scale)
      pads.setMatrixAt(i * PADS_PER_GIANT + p, matrix)
      color.setHSL(0.23 + rng() * 0.05, 0.34, 0.28 + rng() * 0.16)
      pads.setColorAt(i * PADS_PER_GIANT + p, color)
    }
  })

  trunks.castShadow = true
  trunks.receiveShadow = true
  scene.add(trunks, buttresses, crowns, pads)
}

/** The limbs: the sim's standable platforms, dressed as branches with foliage on top. */
function addBranches(scene: Scene, arena: Arena): void {
  const limbs = arena.buildings.filter((b) => b.kind === 'branch')
  if (limbs.length === 0) return

  const barkMat = new MeshStandardMaterial({
    map: tex('/textures/giant_bark.jpg', 2, 1),
    normalMap: tex('/textures/giant_bark_nor.jpg', 2, 1, false),
    color: 0x8a7154,
    // a limb is nearly always overhead with the sun behind it: without a floor under the
    // shading it renders as a black slab pasted on the canopy
    emissive: 0x241a12,
    roughness: 1,
  })
  const leafMat = foliageMaterial(2)

  const box = new BoxGeometry(1, 1, 1)
  box.translate(0, 0.5, 0) // grow up from y0, exactly as the sim's solid does
  const beams = new InstancedMesh(box, barkMat, limbs.length)
  const sprigs = new InstancedMesh(new SphereGeometry(1, 8, 6), leafMat, limbs.length)

  const matrix = new Matrix4()
  const quat = new Quaternion()
  const color = new Color()
  const rng = createRng(0x5eaf)

  limbs.forEach((b, i) => {
    const thickness = b.h - b.y0
    matrix.compose(
      new Vector3(b.x, b.y0, b.z),
      quat,
      new Vector3(b.w, thickness, b.d),
    )
    beams.setMatrixAt(i, matrix)
    color.setHSL(0.08, 0.2, 0.3 + b.tint * 0.1)
    beams.setColorAt(i, color)

    // foliage bunched at the far end of the limb, never over the standable top
    const alongX = b.w > b.d
    const tip = (alongX ? b.w : b.d) * 0.42
    const dir = b.x > 0 || b.z > 0 ? 1 : -1
    const r = 3 + rng() * 2.5
    matrix.compose(
      new Vector3(
        b.x + (alongX ? dir * tip : 0),
        b.h + r * 0.35,
        b.z + (alongX ? 0 : dir * tip),
      ),
      quat,
      new Vector3(r, r * 0.5, r),
    )
    sprigs.setMatrixAt(i, matrix)
    color.setHSL(0.25, 0.3, 0.2 + rng() * 0.12)
    sprigs.setColorAt(i, color)
  })

  beams.castShadow = true
  beams.receiveShadow = true
  scene.add(beams, sprigs)
}

/** The mid-story: ordinary trees and ferns. Nothing here is 80 m, and that is the point. */
function addUnderstory(scene: Scene, arena: Arena): void {
  const saplings = arena.buildings.filter((b) => b.kind === 'sapling')
  const rng = createRng(0x2b17)
  const matrix = new Matrix4()
  const quat = new Quaternion()
  const color = new Color()

  if (saplings.length > 0) {
    const barkMat = new MeshStandardMaterial({
      map: tex('/textures/tree_bark.jpg', 1, 4),
      normalMap: tex('/textures/tree_bark_nor.jpg', 1, 4, false),
      roughness: 1,
    })
    const leafMat = foliageMaterial(2)
    const trunkGeo = new CylinderGeometry(0.7, 1, 1, 7, 1)
    trunkGeo.translate(0, 0.5, 0)
    const stems = new InstancedMesh(trunkGeo, barkMat, saplings.length)
    const canopies = new InstancedMesh(new IcosahedronGeometry(1, 0), leafMat, saplings.length * 2)

    saplings.forEach((s, i) => {
      const radius = s.w / 2
      quat.setFromAxisAngle(new Vector3(0, 1, 0), rng() * Math.PI * 2)
      matrix.compose(new Vector3(s.x, 0, s.z), quat, new Vector3(radius, s.h, radius))
      stems.setMatrixAt(i, matrix)
      color.setHSL(0.09, 0.22, 0.3 + s.tint * 0.12)
      stems.setColorAt(i, color)

      const crown = radius * 2.6 + 2 + rng() * 2
      matrix.compose(
        new Vector3(s.x, s.h - crown * 0.2, s.z),
        quat,
        new Vector3(crown, crown * 0.8, crown),
      )
      canopies.setMatrixAt(i, matrix)
      color.setHSL(0.24, 0.36, 0.24 + rng() * 0.18)
      canopies.setColorAt(i, color)
    })
    scene.add(stems, canopies)
  }

  // ferns: low clumps of leaf on the floor. They take the same shaded-from-below material as
  // the canopy — down here in the giants' shadow, an unlit leaf reads as a grey puddle.
  const ferns = new InstancedMesh(new IcosahedronGeometry(1, 0), foliageMaterial(1), FERN_COUNT)
  let placed = 0
  let guard = 0
  while (placed < FERN_COUNT && guard++ < FERN_COUNT * 6) {
    const angle = rng() * Math.PI * 2
    const r = Math.sqrt(rng()) * (arena.wallRadius - 6)
    const x = Math.cos(angle) * r
    const z = Math.sin(angle) * r
    if (r < arena.plazaRadius + 3) continue // the clearing keeps its grass
    const size = 0.5 + rng() * 0.9
    quat.setFromAxisAngle(new Vector3(0, 1, 0), rng() * Math.PI * 2)
    matrix.compose(
      new Vector3(x, size * 0.22, z),
      quat,
      new Vector3(size * 1.7, size * 0.4, size * 1.7), // low and spreading: ground cover
    )
    ferns.setMatrixAt(placed, matrix)
    color.setHSL(0.25 + rng() * 0.05, 0.55, 0.34 + rng() * 0.16)
    ferns.setColorAt(placed, color)
    placed++
  }
  ferns.count = placed
  scene.add(ferns)
}

/** The tourist era, abandoned: plank cabins and their white fences around the clearing. */
function addCabins(scene: Scene, arena: Arena): void {
  const cabins = arena.buildings.filter((b) => b.kind === 'cabin')
  if (cabins.length === 0) return

  const plankMat = new MeshStandardMaterial({
    map: tex('/textures/planks.jpg', 2, 1),
    normalMap: tex('/textures/planks_nor.jpg', 2, 1, false),
    roughness: 0.95,
  })
  const shingleMat = new MeshStandardMaterial({
    map: tex('/textures/roof.jpg', 2, 2),
    color: 0x8b7a63,
    roughness: 0.9,
  })
  const color = new Color()
  const rng = createRng(0x9c0b)

  for (const c of cabins) {
    const eave = c.h * 0.68
    const body = new Mesh(new BoxGeometry(c.w, eave, c.d), plankMat)
    body.position.set(c.x, eave / 2, c.z)
    color.setHSL(0.08, 0.2, 0.34 + c.tint * 0.14)
    body.material = plankMat.clone()
    ;(body.material as MeshStandardMaterial).color.copy(color)

    // a plain gable: two slabs leaning together over the eave
    const rise = c.h - eave
    const span = c.ridgeAxis === 'x' ? c.d : c.w
    const slope = Math.atan2(rise, span / 2)
    const roof = new Mesh(new BoxGeometry(c.ridgeAxis === 'x' ? c.w : span * 0.62, 0.3, span * 0.62), shingleMat)
    for (const side of [-1, 1]) {
      const leaf = roof.clone()
      leaf.position.set(
        c.x + (c.ridgeAxis === 'x' ? 0 : (side * span) / 4),
        eave + rise / 2,
        c.z + (c.ridgeAxis === 'x' ? (side * span) / 4 : 0),
      )
      if (c.ridgeAxis === 'x') leaf.rotation.x = side * slope
      else leaf.rotation.z = -side * slope
      leaf.castShadow = true
      scene.add(leaf)
    }
    body.castShadow = body.receiveShadow = true
    scene.add(body)

    // the white paddock fence from the reference, running off the cabin's face
    const railMat = new MeshStandardMaterial({
      map: tex('/textures/planks.jpg', 3, 1),
      color: 0xd9d3c4,
      roughness: 0.9,
    })
    const fence = new Mesh(new BoxGeometry(10 + rng() * 6, 0.22, 0.14), railMat)
    const out = Math.atan2(c.z, c.x)
    for (const railY of [0.75, 1.25]) {
      const rail = fence.clone()
      rail.position.set(c.x + Math.cos(out + 1.2) * 7, railY, c.z + Math.sin(out + 1.2) * 7)
      rail.rotation.y = out + 1.2 + Math.PI / 2
      scene.add(rail)
    }
  }
}

/**
 * The shafts of light down through the crowns. Same trick as the cavern's beams — a hazy
 * additive cone, lit from above — but here they are the sun finding a gap, so they swell
 * and die with the day.
 */
function addGodRays(
  scene: Scene,
  arena: Arena,
): { setNight: (night: number) => void } {
  const mats: { mat: MeshBasicMaterial; base: number }[] = []
  const canopy = arena.forest!.canopyY

  for (const ray of arena.forest!.rays) {
    const mat = new MeshBasicMaterial({
      color: 0xfff0c8,
      transparent: true,
      opacity: 0.07,
      blending: AdditiveBlending,
      depthWrite: false,
      side: BackSide,
      fog: false,
    })
    const beam = new Mesh(
      new CylinderGeometry(ray.radius * 0.55, ray.radius * 1.7, canopy + 8, 18, 1, true),
      mat,
    )
    beam.position.set(ray.x, (canopy + 8) / 2, ray.z)
    scene.add(beam)
    mats.push({ mat, base: 0.07 })

    const poolMat = new MeshBasicMaterial({
      color: 0xffeec2,
      transparent: true,
      opacity: 0.16,
      blending: AdditiveBlending,
      depthWrite: false,
      fog: false,
    })
    const pool = new Mesh(new CircleGeometry(ray.radius * 1.7, 24), poolMat)
    pool.rotation.x = -Math.PI / 2
    pool.position.set(ray.x, 0.9, ray.z)
    scene.add(pool)
    mats.push({ mat: poolMat, base: 0.16 })
  }

  return {
    setNight: (night: number): void => {
      const day = 1 - night
      for (const m of mats) m.mat.opacity = m.base * day
    },
  }
}

/** Everything under the giants. Returns the sky's night callback. */
export function addForest(scene: Scene, arena: Arena): { setNight: (night: number) => void } {
  addFloor(scene, arena)
  addGiants(scene, arena)
  addBranches(scene, arena)
  addUnderstory(scene, arena)
  addCabins(scene, arena)
  return addGodRays(scene, arena)
}

/** A wall of dark forest closing the world: there is no stone wall out here. */
export function addTreeline(scene: Scene, arena: Arena): void {
  const R = arena.wallRadius
  const mat = new MeshStandardMaterial({
    map: tex('/textures/giant_bark.jpg', 60, 2),
    color: 0x2f3a28,
    roughness: 1,
    side: BackSide,
  })
  const wall = new Mesh(new CylinderGeometry(R + 10, R + 10, 90, 60, 1, true), mat)
  wall.position.y = 45
  scene.add(wall)
  void Object3D // (kept: the scene graph types come from three)
}
