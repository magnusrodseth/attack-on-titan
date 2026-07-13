import {
  BackSide,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Euler,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  InstancedMesh,
  Matrix4,
  Mesh,
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
import type { Arena, Building } from '../sim/city'
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

/** Cards per crown, per umbrella pad, and per sapling: the density of the canopy. */
const CROWN_CARDS = 13
const PADS_PER_GIANT = 4
const PAD_CARDS = 4
const SAPLING_CARDS = 4
const FERN_COUNT = 700

/**
 * Foliage is CUT-OUT CARDS, not geometry: a photographed spray of cedar (the sugi the giants
 * are) or of broadleaf, on an alpha-masked quad. A canopy built from solid blobs reads as a
 * pile of green boulders no matter how you shade it — the silhouette is the whole thing, and
 * only an alpha cut-out has a real one.
 *
 * alphaTest, not transparency: a transparent material would demand back-to-front sorting of
 * thousands of overlapping cards (and still get it wrong), while an alpha-tested one writes
 * depth like any solid and costs nothing to sort.
 *
 * The emissive floor stays: you are always under the canopy looking UP at it with the sun
 * behind it, and a leaf with no light of its own renders as a black scrap.
 */
function leafMaterial(card: 'conifer' | 'broad'): MeshStandardMaterial {
  return new MeshStandardMaterial({
    map: tex(`/textures/leaf_${card}.png`, 1, 1),
    alphaTest: 0.42,
    side: DoubleSide,
    color: 0xb9c9a2,
    emissive: 0x1b2814,
    roughness: 1,
  })
}

/** A leaf card: a unit quad, drawn from both sides. */
const LEAF_CARD = new PlaneGeometry(1, 1)

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
    // ~2.5 m of bark per tile. The sugi's fibres are fine: stretch a tile over 20 m of trunk
    // and they average out into a smooth brown wall, which is exactly what a pillar looks like.
    map: tex('/textures/giant_bark.jpg', 5, 22),
    normalMap: tex('/textures/giant_bark_nor.jpg', 5, 22, false),
    normalScale: new Vector2(2.4, 2.4), // the bark's channels are the whole read up close
    // barely any: emissive is a FLAT colour added everywhere, and too much of it washes the
    // bark's contrast out into mud. The trunks have the hemisphere light; it is the leaves
    // overhead, backlit against the sky, that actually need a floor under their shading.
    emissive: 0x0c0906,
    roughness: 1,
  })
  const leafMat = leafMaterial('conifer')

  const matrix = new Matrix4()
  const quat = new Quaternion()
  const euler = new Euler()
  const color = new Color()
  const scale = new Vector3()
  const at = new Vector3()
  const rng = createRng(0xf0e5)

  // Three trunk shapes, not one. A perfect cylinder reads as a pillar however good the bark
  // is — a real trunk's silhouette wanders. Each variant is a lathe whose radius is walked by
  // noise up its height and around its circumference, so the edge is never a straight line.
  const variants = [0, 1, 2].map((v) => trunkGeometry(v))
  const buckets: Building[][] = [[], [], []]
  giants.forEach((g, i) => buckets[i % 3]!.push(g))

  const buttressGeo = new ConeGeometry(1, 1, 18, 1, true)
  buttressGeo.translate(0, 0.5, 0)
  const buttresses = new InstancedMesh(buttressGeo, barkMat, giants.length)

  const crowns = new InstancedMesh(LEAF_CARD, leafMat, giants.length * CROWN_CARDS)
  const pads = new InstancedMesh(LEAF_CARD, leafMat, giants.length * PADS_PER_GIANT * PAD_CARDS)

  buckets.forEach((bucket, v) => {
    const trunks = new InstancedMesh(variants[v]!, barkMat, Math.max(1, bucket.length))
    bucket.forEach((g, i) => {
      const radius = g.w / 2
      quat.setFromAxisAngle(new Vector3(0, 1, 0), rng() * Math.PI * 2)
      at.set(g.x, 0, g.z)
      scale.set(radius, g.h, radius)
      matrix.compose(at, quat, scale)
      trunks.setMatrixAt(i, matrix)
      // keep the tints bright enough that the bark's own dark channels stay the darkest thing
      color.setHSL(0.07 + g.tint * 0.02, 0.14, 0.46 + g.tint * 0.16)
      trunks.setColorAt(i, color)
    })
    trunks.count = bucket.length
    trunks.castShadow = true
    trunks.receiveShadow = true
    scene.add(trunks)
  })

  giants.forEach((g, i) => {
    const radius = g.w / 2
    quat.setFromAxisAngle(new Vector3(0, 1, 0), rng() * Math.PI * 2)

    // the buttress: the root flare where the giant meets the floor
    const flare = 4 + g.tint * 3
    at.set(g.x, 0, g.z)
    scale.set(radius * 1.6, flare, radius * 1.6)
    matrix.compose(at, quat, scale)
    buttresses.setMatrixAt(i, matrix)
    color.setHSL(0.07, 0.2, 0.42 + g.tint * 0.14)
    buttresses.setColorAt(i, color)

    // the crown: a cloud of leaf cards on random axes, densest at the top of the trunk
    const crownR = radius * 2.4 + 6
    for (let c = 0; c < CROWN_CARDS; c++) {
      const angle = rng() * Math.PI * 2
      const spread = crownR * (0.15 + rng() * 0.9)
      const card = crownR * (0.7 + rng() * 0.75)
      euler.set(rng() * 0.9 - 0.45, rng() * Math.PI * 2, rng() * 0.7 - 0.35)
      quat.setFromEuler(euler)
      at.set(
        g.x + Math.cos(angle) * spread,
        g.h - 4 + rng() * crownR * 0.85,
        g.z + Math.sin(angle) * spread,
      )
      scale.set(card, card, card)
      matrix.compose(at, quat, scale)
      crowns.setMatrixAt(i * CROWN_CARDS + c, matrix)
      color.setHSL(0.24 + rng() * 0.05, 0.3 + rng() * 0.2, 0.34 + rng() * 0.2)
      crowns.setColorAt(i * CROWN_CARDS + c, color)
    }

    // the pads: umbrella sprays off the flank of the trunk, near-flat, as in the references
    for (let p = 0; p < PADS_PER_GIANT; p++) {
      const angle = rng() * Math.PI * 2
      const y = g.h * (0.4 + (p / PADS_PER_GIANT) * 0.46 + rng() * 0.05)
      const reach = radius + 3 + rng() * 5
      const padR = 7 + rng() * 6
      for (let c = 0; c < PAD_CARDS; c++) {
        // near-horizontal cards, fanned: an umbrella of foliage, not a ball
        euler.set(Math.PI / 2 + (rng() - 0.5) * 0.5, rng() * Math.PI * 2, (rng() - 0.5) * 0.4)
        quat.setFromEuler(euler)
        at.set(
          g.x + Math.cos(angle) * reach + (rng() - 0.5) * padR * 0.7,
          y + (rng() - 0.5) * 2.4,
          g.z + Math.sin(angle) * reach + (rng() - 0.5) * padR * 0.7,
        )
        const size = padR * (0.75 + rng() * 0.5)
        scale.set(size, size, size)
        matrix.compose(at, quat, scale)
        pads.setMatrixAt(i * PADS_PER_GIANT * PAD_CARDS + p * PAD_CARDS + c, matrix)
        color.setHSL(0.24 + rng() * 0.05, 0.32, 0.3 + rng() * 0.2)
        pads.setColorAt(i * PADS_PER_GIANT * PAD_CARDS + p * PAD_CARDS + c, color)
      }
    }
  })

  scene.add(buttresses, crowns, pads)
}

/**
 * A trunk whose edge wanders. Radius is walked by noise both up the height and around the
 * circumference, so the silhouette is irregular the way a real trunk's is — the single thing
 * that separates a tree from a pillar at a distance, whatever the bark does.
 */
function trunkGeometry(variant: number): BufferGeometry {
  const rings = 20
  const sectors = 22
  const positions: number[] = []
  const uvs: number[] = []
  const seed = 0x71a3 + variant * 977

  const at = (ri: number, si: number): [number, number, number] => {
    const t = ri / rings
    const a = (si / sectors) * Math.PI * 2
    // taper: fat at the root, slim at the crown, as a cedar is
    const taper = 1.06 - 0.3 * t * t
    const wobble = 0.9 + 0.2 * valueNoise(Math.cos(a) * 3 + variant * 9, t * 7, 1.6, seed)
    const r = taper * wobble
    return [Math.cos(a) * r, t, Math.sin(a) * r]
  }

  for (let ri = 0; ri < rings; ri++) {
    for (let si = 0; si < sectors; si++) {
      const a = at(ri, si)
      const b = at(ri + 1, si)
      const c = at(ri + 1, si + 1)
      const d = at(ri, si + 1)
      for (const [v, u0, v0] of [
        [a, si / sectors, ri / rings],
        [b, si / sectors, (ri + 1) / rings],
        [c, (si + 1) / sectors, (ri + 1) / rings],
        [a, si / sectors, ri / rings],
        [c, (si + 1) / sectors, (ri + 1) / rings],
        [d, (si + 1) / sectors, ri / rings],
      ] as [number[], number, number][]) {
        positions.push(v[0]!, v[1]!, v[2]!)
        uvs.push(u0, v0)
      }
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2))
  geometry.computeVertexNormals()
  return geometry
}

/**
 * The limbs. The sim's solid is an axis-aligned box (that is what makes a limb a platform you
 * can land on), but a box is not a branch — so the DRESSING is a tapered bough, thick where it
 * leaves the trunk and thin at the tip, with a spray of foliage hanging off the end. The top of
 * the bough sits on the sim's standable surface, so where you land is where you see yourself land.
 */
function addBranches(scene: Scene, arena: Arena): void {
  const limbs = arena.buildings.filter((b) => b.kind === 'branch')
  if (limbs.length === 0) return

  const barkMat = new MeshStandardMaterial({
    map: tex('/textures/giant_bark.jpg', 3, 1),
    normalMap: tex('/textures/giant_bark_nor.jpg', 3, 1, false),
    color: 0x8a7154,
    // a limb is nearly always overhead with the sun behind it: without a floor under the
    // shading it renders as a black slab pasted on the canopy
    emissive: 0x241a12,
    roughness: 1,
  })
  const leafMat = leafMaterial('conifer')

  // a bough lying along +x: thick at the trunk end, tapering to the tip
  const boughGeo = new CylinderGeometry(0.32, 0.5, 1, 9, 1)
  boughGeo.rotateZ(Math.PI / 2) // lie it down along x
  const boughs = new InstancedMesh(boughGeo, barkMat, limbs.length)
  const sprays = new InstancedMesh(LEAF_CARD, leafMat, limbs.length * 3)

  const matrix = new Matrix4()
  const quat = new Quaternion()
  const euler = new Euler()
  const color = new Color()
  const scale = new Vector3()
  const at = new Vector3()
  const rng = createRng(0x5eaf)

  limbs.forEach((b, i) => {
    const thickness = b.h - b.y0
    const alongX = b.w > b.d
    const length = alongX ? b.w : b.d
    // the bough's crown rides the sim's standable top, so a landing looks like a landing
    const topY = b.h - thickness * 0.5
    euler.set(0, alongX ? 0 : Math.PI / 2, 0)
    quat.setFromEuler(euler)
    at.set(b.x, topY, b.z)
    scale.set(length, thickness * 1.5, thickness * 1.5)
    matrix.compose(at, quat, scale)
    boughs.setMatrixAt(i, matrix)
    color.setHSL(0.07, 0.22, 0.3 + b.tint * 0.12)
    boughs.setColorAt(i, color)

    // foliage hanging off the outboard end — never over the top, which you have to stand on
    const dir = (alongX ? b.x : b.z) > 0 ? 1 : -1
    for (let c = 0; c < 3; c++) {
      const out = length * (0.3 + c * 0.14)
      const size = 6 + rng() * 5
      euler.set(Math.PI / 2 + (rng() - 0.5) * 0.6, rng() * Math.PI * 2, (rng() - 0.5) * 0.5)
      quat.setFromEuler(euler)
      at.set(
        b.x + (alongX ? dir * out : (rng() - 0.5) * 3),
        b.h - 1 + (rng() - 0.5) * 2,
        b.z + (alongX ? (rng() - 0.5) * 3 : dir * out),
      )
      scale.set(size, size, size)
      matrix.compose(at, quat, scale)
      sprays.setMatrixAt(i * 3 + c, matrix)
      color.setHSL(0.24 + rng() * 0.05, 0.32, 0.32 + rng() * 0.18)
      sprays.setColorAt(i * 3 + c, color)
    }
  })

  boughs.castShadow = true
  boughs.receiveShadow = true
  scene.add(boughs, sprays)
}

/** The mid-story: ordinary trees and ferns. Nothing here is 80 m, and that is the point. */
function addUnderstory(scene: Scene, arena: Arena): void {
  const saplings = arena.buildings.filter((b) => b.kind === 'sapling')
  const rng = createRng(0x2b17)
  const matrix = new Matrix4()
  const quat = new Quaternion()
  const euler = new Euler()
  const color = new Color()

  if (saplings.length > 0) {
    const barkMat = new MeshStandardMaterial({
      map: tex('/textures/tree_bark.jpg', 1, 4),
      normalMap: tex('/textures/tree_bark_nor.jpg', 1, 4, false),
      roughness: 1,
    })
    const leafMat = leafMaterial('broad')
    const trunkGeo = new CylinderGeometry(0.7, 1, 1, 8, 1)
    trunkGeo.translate(0, 0.5, 0)
    const stems = new InstancedMesh(trunkGeo, barkMat, saplings.length)
    const canopies = new InstancedMesh(LEAF_CARD, leafMat, saplings.length * SAPLING_CARDS)

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

  // ferns: leaf cards standing up out of the litter, tilted every way
  const ferns = new InstancedMesh(LEAF_CARD, leafMaterial('broad'), FERN_COUNT)
  let placed = 0
  let guard = 0
  while (placed < FERN_COUNT && guard++ < FERN_COUNT * 6) {
    const angle = rng() * Math.PI * 2
    const r = Math.sqrt(rng()) * (arena.wallRadius - 6)
    const x = Math.cos(angle) * r
    const z = Math.sin(angle) * r
    if (r < arena.plazaRadius + 3) continue // the clearing keeps its grass
    const size = 1.4 + rng() * 1.6
    euler.set((rng() - 0.5) * 0.5, rng() * Math.PI * 2, (rng() - 0.5) * 0.5)
    quat.setFromEuler(euler)
    matrix.compose(new Vector3(x, size * 0.42, z), quat, new Vector3(size, size, size))
    ferns.setMatrixAt(placed, matrix)
    color.setHSL(0.25 + rng() * 0.05, 0.4, 0.32 + rng() * 0.16)
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
 * Everything under the giants. No god rays: a forest lit by circles of light on the floor
 * reads as a stage, not a wood — the canopy's own gaps and shadows do that job (user, 2026-07-13).
 */
export function addForest(scene: Scene, arena: Arena): void {
  addFloor(scene, arena)
  addGiants(scene, arena)
  addBranches(scene, arena)
  addUnderstory(scene, arena)
  addCabins(scene, arena)
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
