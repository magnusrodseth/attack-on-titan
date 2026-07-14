import { Vector3 } from 'three'

/**
 * AoT-district city geometry (see wayfinder ticket 007 and the v2 rework): dense gabled
 * row-houses in height districts, warehouses and church towers as mid/high anchors, two
 * boulevards crossing at the plaza, a canal chord with swing-under bridges, a sealed
 * main gate, all ringed by a 50m wall. `h` is total height including the roof ridge and
 * is what hooks and collision use; `y0` is the base height — elevated decks (bridges,
 * the gate span) set it above 0 so soldiers can pass underneath.
 */
export type BuildingKind =
  | 'house' // gabled row house (also the cathedral nave)
  | 'warehouse' // mid-tier gable: fills the band between rooftops and towers
  | 'tower' // church tower with a pyramid spire
  | 'cathedral' // the district's one great spire
  | 'gatehouse' // the two towers flanking the sealed main gate
  | 'bastion' // wall bastion towers at the other cardinal points
  | 'deck' // elevated flat span (bridge decks, the gate span); y0 > 0
  | 'pier' // bridge piers and stair blocks
  | 'chimney' // rooftop perch above a house ridge
  | 'flagpole' // thin high anchor on towers and spans
  | 'well'
  | 'stall'
  | 'cart'
  | 'pillar' // cavern rock column, floor to ceiling (cylinder)
  | 'stalactite' // hanging cavern rock, y0 well above the streets (cylinder)
  | 'trunk' // giant tree, 80m of cliff-face bark (cylinder)
  | 'branch' // thick limb off a giant: a standable platform high in the air (y0 > 0)
  | 'sapling' // ordinary tree between the giants — the underbrush that sells the scale
  | 'cabin' // abandoned tourist-era hut at the forest edge

export interface Building {
  x: number
  z: number
  w: number
  d: number
  /** Base height of the solid box; > 0 means you can pass (and swing) underneath. */
  y0: number
  /** Total height including the roof ridge or spire tip (absolute, not relative to y0). */
  h: number
  kind: BuildingKind
  ridgeAxis: 'x' | 'z'
  tint: number
  /** Round solids (cavern pillars, stalactites): w is the diameter and d must equal w. */
  shape?: 'box' | 'cyl'
}

function cylRadius(b: Building): number {
  return b.w / 2
}

export type RoofShape = 'gable' | 'pyramid' | 'flat'

export const ROOF_SHAPE: Record<BuildingKind, RoofShape> = {
  house: 'gable',
  warehouse: 'gable',
  tower: 'pyramid',
  cathedral: 'pyramid',
  gatehouse: 'pyramid',
  bastion: 'pyramid',
  deck: 'flat',
  pier: 'flat',
  chimney: 'flat',
  flagpole: 'flat',
  well: 'flat',
  stall: 'flat',
  cart: 'flat',
  pillar: 'flat',
  stalactite: 'flat',
  trunk: 'flat',
  branch: 'flat',
  sapling: 'flat',
  cabin: 'gable',
}

/**
 * Fraction of total height where the walls end and the roof begins. The single source
 * of truth shared by sim raycasts/collision AND the renderer — if these drift apart,
 * hooks anchor to air or sink into roofs.
 */
export const EAVE_FRACTION: Record<BuildingKind, number> = {
  house: 0.7,
  warehouse: 0.8,
  tower: 0.78,
  cathedral: 0.82,
  gatehouse: 0.86,
  bastion: 0.86,
  deck: 1,
  pier: 1,
  chimney: 1,
  flagpole: 1,
  well: 1,
  stall: 1,
  cart: 1,
  pillar: 1,
  stalactite: 1,
  trunk: 1,
  branch: 1,
  sapling: 1,
  cabin: 0.68,
}

export function eaveHeight(b: Building): number {
  return b.h * EAVE_FRACTION[b.kind]
}

/** The canal runs the full north-south chord at a fixed x; water sits below street level. */
export interface CanalSpec {
  x: number
  halfWidth: number
  /** Canal bed: what wading feet stand on. */
  bedY: number
  /** Water surface: below this, wading drag applies. */
  waterY: number
}

/**
 * A cavern roof over the whole arena (the Underground). The ceiling is a paraboloid:
 * `centerY` above the plaza easing to `edgeY` where it meets the perimeter rock wall
 * (wallHeight should equal edgeY so the wall rises to meet the dome). One analytic
 * surface shared by hook raycasts, the flight clamp and the renderer — they can't drift.
 */
export interface CavernSpec {
  centerY: number
  edgeY: number
  /**
   * Holes in the rock, open to the surface: real sky is visible through them, so the
   * cavern keeps the day/night cycle. Landmarks for the renderer and the course.
   */
  shafts: { x: number; z: number; radius: number }[]
  /** Street torches: the light the Underground lives by. Render/light data only. */
  torches: { x: number; z: number }[]
}

/**
 * The Forest of Giant Trees. The giants are `trunk` buildings and their limbs are
 * `branch` platforms; this only carries what the whole arena needs to know about itself —
 * chiefly the canopy height, which is what re-bands the course's gate tiers from
 * street/canyon/rooftop into floor/trunk/canopy.
 */
export interface ForestSpec {
  /** Nominal height of the crowns: the ceiling of the playable envelope. */
  canopyY: number
  /** The clearing the run starts in, and the light shafts that fall through the crowns. */
  rays: { x: number; z: number; radius: number }[]
}

export interface Arena {
  buildings: Building[]
  wallRadius: number
  wallHeight: number
  plazaRadius: number
  /** Resupply stations: the plaza one first, then one per cardinal on open ground. */
  stations: Vector3[]
  canal: CanalSpec | null
  cavern: CavernSpec | null
  forest: ForestSpec | null
  /** Wall angle (radians, +X = 0) of the sealed main gate; bastions hold the other cardinals. */
  gateAngle: number
  /**
   * Where a Shifter walks in. Each map means something different by it — the district's
   * breached gate, the Underground's stairway down, a gap in the Forest's canopy — and in
   * a cavern it sits well in from the rim, where the roof is tall enough for a big one to
   * stand up straight. Read it instead of guessing from gateAngle.
   */
  bossEntry: Vector3
  /** Broadphase over buildings; rebuilt lazily whenever buildings.length changes. */
  index?: BuildingIndex
}

export function emptyArena(): Arena {
  return {
    buildings: [],
    wallRadius: 260,
    wallHeight: 50,
    plazaRadius: 22,
    stations: [new Vector3(0, 0, 0)],
    canal: null,
    cavern: null,
    forest: null,
    gateAngle: 0,
    bossEntry: new Vector3(260 * BOSS_ENTRY_FRACTION, 0, 0),
  }
}

/** How far out the breach sits, as a fraction of the wall radius. */
export const BOSS_ENTRY_FRACTION = 0.88

/**
 * Where a Shifter enters on an open map: just inside the wall, on the gate's side. A
 * cavern overrides this — see undergroundgen, which brings it down the stairway and in
 * under the tall middle of the dome, since the rim has no headroom for a big one.
 */
export function gateBossEntry(wallRadius: number, gateAngle: number): Vector3 {
  const r = wallRadius * BOSS_ENTRY_FRACTION
  return new Vector3(Math.cos(gateAngle) * r, 0, Math.sin(gateAngle) * r)
}

/** Ceiling height at a point; Infinity under an open sky. */
export function ceilingHeightAt(arena: Arena, x: number, z: number): number {
  const cavern = arena.cavern
  if (!cavern) return Infinity
  const r2 = (x * x + z * z) / (arena.wallRadius * arena.wallRadius)
  return cavern.edgeY + (cavern.centerY - cavern.edgeY) * Math.max(0, 1 - r2)
}

/** True inside one of the holes worn through to the surface — where there is no rock. */
export function inShaft(arena: Arena, x: number, z: number): boolean {
  const cavern = arena.cavern
  if (!cavern) return false
  return cavern.shafts.some((s) => Math.hypot(s.x - x, s.z - z) < s.radius)
}

/** How far up into an opening a soldier may climb before the surface stops them. */
export const SHAFT_LIP = 8

/** Clearance a titan keeps between the top of its head and the cavern roof. */
export const TITAN_HEADROOM = 2

/**
 * The tallest titan that fits standing here — Infinity under an open sky. Spawns cap
 * themselves with this, which is why the Colossal is the height of the cavern rather
 * than 60m of nape buried in rock.
 */
export function maxTitanHeightAt(arena: Arena, x: number, z: number): number {
  if (!arena.cavern) return Infinity
  return ceilingHeightAt(arena, x, z) - TITAN_HEADROOM
}

/**
 * How far from the centre a titan this tall may walk before the roof meets its head — the
 * exact inverse of maxTitanHeightAt, so a titan capped to the headroom where it spawned
 * may stand precisely there. The dome is tallest in the middle, so the bigger the titan
 * the smaller its world: a Colossal is penned into the cavern's heart and the fight comes
 * to it. Under an open sky the wall is the only bound.
 */
export function titanRoamRadius(arena: Arena, height: number): number {
  const cavern = arena.cavern
  if (!cavern) return arena.wallRadius
  const need = height + TITAN_HEADROOM
  if (need <= cavern.edgeY) return arena.wallRadius
  if (need >= cavern.centerY) return 0
  // invert ceilingHeightAt: y(r) = edgeY + (centerY - edgeY)(1 - r²/R²)
  const frac = 1 - (need - cavern.edgeY) / (cavern.centerY - cavern.edgeY)
  return arena.wallRadius * Math.sqrt(Math.max(0, frac))
}

/**
 * Fences a titan into the ground it fits on: inside the wall, and (in a cavern) inside the
 * radius where the roof still clears its head. Titans have no wall clamp of their own
 * otherwise, which in the Forest — a map with no wall at all — means they simply leave.
 */
export function clampTitanToArena(arena: Arena, pos: Vector3, vel: Vector3, height: number): void {
  const limit = Math.min(arena.wallRadius - 2, titanRoamRadius(arena, height))
  const dist = Math.hypot(pos.x, pos.z)
  if (dist <= limit || dist === 0) return
  const nx = pos.x / dist
  const nz = pos.z / dist
  pos.x = nx * limit
  pos.z = nz * limit
  const outward = vel.x * nx + vel.z * nz
  if (outward > 0) {
    vel.x -= nx * outward
    vel.z -= nz * outward
  }
}

/**
 * Keeps airborne soldiers out of the cavern rock; a no-op under an open sky. There is no
 * rock in a shaft, so the rule follows the geometry: rise into the opening and you may go
 * on up, far enough to put your head out and see the sky, and no further.
 */
export function clampToCeiling(arena: Arena, pos: Vector3, vel: Vector3, margin: number): void {
  if (!arena.cavern) return
  const rock = ceilingHeightAt(arena, pos.x, pos.z)
  const limit = (inShaft(arena, pos.x, pos.z) ? rock + SHAFT_LIP : rock) - margin
  if (pos.y <= limit) return
  pos.y = limit
  if (vel.y > 0) vel.y = 0
}

/**
 * Ray vs the ceiling paraboloid y(r) = centerY - K * (r/R)^2. Substituting the ray gives
 * a quadratic in t; the smallest positive root inside the wall radius is the anchor.
 */
function rayVsCeiling(arena: Arena, origin: Vector3, dir: Vector3): number | null {
  const cavern = arena.cavern
  if (!cavern) return null
  const R = arena.wallRadius
  const A = (cavern.centerY - cavern.edgeY) / (R * R)
  const a = A * (dir.x * dir.x + dir.z * dir.z)
  const b = 2 * A * (origin.x * dir.x + origin.z * dir.z) + dir.y
  const c = A * (origin.x * origin.x + origin.z * origin.z) + origin.y - cavern.centerY
  let roots: number[]
  if (Math.abs(a) < 1e-12) {
    if (Math.abs(b) < 1e-12) return null
    roots = [-c / b]
  } else {
    const disc = b * b - 4 * a * c
    if (disc < 0) return null
    const sq = Math.sqrt(disc)
    roots = [(-b - sq) / (2 * a), (-b + sq) / (2 * a)].sort((p, q) => p - q)
  }
  for (const t of roots) {
    if (t <= 0.01) continue
    const x = origin.x + dir.x * t
    const z = origin.z + dir.z * t
    if (Math.hypot(x, z) > R + 1e-6) continue
    // a hook fired at an opening finds no rock: it flies out at the sky and comes back
    // empty. The rim around the hole is real stone and still catches.
    if (inShaft(arena, x, z)) continue
    return t
  }
  return null
}

/** Horizontal distance to the closest resupply station; every consumer resupplies there. */
export function nearestStationDist(arena: Arena, x: number, z: number): number {
  let best = Infinity
  for (const s of arena.stations) {
    const dist = Math.hypot(x - s.x, z - s.z)
    if (dist < best) best = dist
  }
  return best
}

/** Terrain height ignoring buildings: 0 everywhere except the canal bed. */
export function baseGroundY(arena: Arena, x: number, _z: number): number {
  const canal = arena.canal
  if (canal && Math.abs(x - canal.x) < canal.halfWidth) return canal.bedY
  return 0
}

/** Height of the building surface (wall top, roof slope, or spire) at a point, 0 outside. */
export function surfaceHeightAt(b: Building, x: number, z: number): number {
  const dx = x - b.x
  const dz = z - b.z
  if (b.shape === 'cyl') return Math.hypot(dx, dz) < cylRadius(b) ? b.h : 0
  if (Math.abs(dx) > b.w / 2 || Math.abs(dz) > b.d / 2) return 0
  const shape = ROOF_SHAPE[b.kind]
  if (shape === 'flat') return b.h
  const eave = eaveHeight(b)
  const rise = b.h - eave
  if (shape === 'pyramid') {
    const t = Math.max(Math.abs(dx) / (b.w / 2), Math.abs(dz) / (b.d / 2))
    return eave + rise * (1 - t)
  }
  const cross = b.ridgeAxis === 'x' ? Math.abs(dz) / (b.d / 2) : Math.abs(dx) / (b.w / 2)
  return eave + rise * (1 - cross)
}

/** An elevated surface only counts as ground once your feet have cleared its base. */
const STEP_TOLERANCE = 0.3

/**
 * Highest standable surface at a point, seen from feet height `feetY`. Elevated decks
 * behave like one-way platforms: below their base you pass under freely; at or above
 * it they catch you. Pass Infinity to get the absolute skyline height.
 */
export function groundHeightAt(arena: Arena, x: number, z: number, feetY: number): number {
  let ground = baseGroundY(arena, x, z)
  const index = ensureIndex(arena)
  const bucket = bucketAtPoint(index, x, z)
  if (bucket) {
    for (const bi of bucket) {
      const b = arena.buildings[bi]!
      if (b.y0 > feetY + STEP_TOLERANCE) continue
      const surface = surfaceHeightAt(b, x, z)
      // surfaceHeightAt returns 0 for "outside the footprint" — that must not beat
      // a negative base like the canal bed
      if (surface > 0 && surface > ground) ground = surface
    }
  }
  return ground
}

/**
 * True when the XZ point is inside a building footprint (inflate < 0 shrinks it).
 * Buildings based above `maxBaseY` (bridge decks, the gate span) don't count — being
 * underneath one is not being embedded in it.
 */
export function insideBuildingXZ(
  arena: Arena,
  x: number,
  z: number,
  inflate = 0,
  maxBaseY = 0.5,
): boolean {
  const pad = Math.max(inflate, 0)
  let hit = false
  forEachInRect(arena, x - pad, x + pad, z - pad, z + pad, (b) => {
    if (b.y0 > maxBaseY) return
    if (b.shape === 'cyl') {
      if (Math.hypot(x - b.x, z - b.z) < cylRadius(b) + inflate) hit = true
      return
    }
    if (Math.abs(x - b.x) < b.w / 2 + inflate && Math.abs(z - b.z) < b.d / 2 + inflate) hit = true
  })
  return hit
}

/**
 * Undergrowth a titan walks straight through. Nav keeps 1.6 m of clearance but a big titan
 * is 2.6 m at the ankle, so it will happily be routed between two saplings it cannot fit
 * between and grind there. A fifteen-metre giant does not squeeze past a young tree — it
 * flattens it, and the Forest floor stops being a maze of snags.
 */
const TITAN_TRAMPLES: ReadonlySet<BuildingKind> = new Set<BuildingKind>(['sapling'])

export function resolveBuildingCollision(
  arena: Arena,
  pos: Vector3,
  vel: Vector3,
  radius: number,
  trample = false,
): void {
  forEachInRect(arena, pos.x - radius, pos.x + radius, pos.z - radius, pos.z + radius, (b) => {
    if (trample && TITAN_TRAMPLES.has(b.kind)) return
    // walls only push between the base and the eaves; the ground clamp owns roof-slope
    // contact, and below an elevated deck you pass under freely. The epsilon keeps
    // ground-walkers (titans stand at y = 0 exactly) colliding with ground buildings.
    if (pos.y >= eaveHeight(b) || pos.y < b.y0 - 0.01) return
    if (b.shape === 'cyl') {
      const dx = pos.x - b.x
      const dz = pos.z - b.z
      const dist = Math.hypot(dx, dz)
      const ex = cylRadius(b) + radius
      if (dist >= ex) return
      const nx = dist > 1e-6 ? dx / dist : 1
      const nz = dist > 1e-6 ? dz / dist : 0
      pos.x = b.x + nx * ex
      pos.z = b.z + nz * ex
      const inward = vel.x * nx + vel.z * nz
      if (inward < 0) {
        vel.x -= nx * inward
        vel.z -= nz * inward
      }
      return
    }
    const ex = b.w / 2 + radius
    const ez = b.d / 2 + radius
    const dx = pos.x - b.x
    const dz = pos.z - b.z
    if (Math.abs(dx) >= ex || Math.abs(dz) >= ez) return
    const penX = ex - Math.abs(dx)
    const penZ = ez - Math.abs(dz)
    if (penX < penZ) {
      const side = dx >= 0 ? 1 : -1
      pos.x = b.x + side * ex
      if (vel.x * side < 0) vel.x = 0
    } else {
      const side = dz >= 0 ? 1 : -1
      pos.z = b.z + side * ez
      if (vel.z * side < 0) vel.z = 0
    }
  })
}

export function clampToWall(arena: Arena, pos: Vector3, vel: Vector3, margin: number): void {
  const limit = arena.wallRadius - margin
  const dist = Math.hypot(pos.x, pos.z)
  if (dist <= limit || dist === 0) return
  const nx = pos.x / dist
  const nz = pos.z / dist
  pos.x = nx * limit
  pos.z = nz * limit
  const outward = vel.x * nx + vel.z * nz
  if (outward > 0) {
    vel.x -= nx * outward
    vel.z -= nz * outward
  }
}

/** Analytic hook raycast against building volumes and the wall ring. Returns the anchor point. */
export function raycastHookTarget(
  arena: Arena,
  origin: Vector3,
  dir: Vector3,
  maxRange: number,
): Vector3 | null {
  let bestT = maxRange
  let found = false

  const tWall = rayVsWall(origin, dir, arena.wallRadius, arena.wallHeight)
  if (tWall !== null && tWall < bestT && tWall > 0.01) {
    bestT = tWall
    found = true
  }

  const tCeiling = rayVsCeiling(arena, origin, dir)
  if (tCeiling !== null && tCeiling < bestT) {
    bestT = tCeiling
    found = true
  }

  const t = raycastBuildings(arena, origin, dir, bestT)
  if (t !== null) {
    bestT = t
    found = true
  }

  if (!found) return null
  return origin.clone().addScaledVector(dir, bestT)
}

/** Walls up to the eaves, then real gable slopes; pyramids and flats are box volumes. */
export function rayVsBuilding(origin: Vector3, dir: Vector3, b: Building): number | null {
  if (b.shape === 'cyl') return rayVsCylinder(origin, dir, b)
  const shape = ROOF_SHAPE[b.kind]
  if (shape !== 'gable') return rayVsAabb(origin, dir, b, b.y0, b.h)
  const wallT = rayVsAabb(origin, dir, b, b.y0, eaveHeight(b))
  const roofT = rayVsGable(origin, dir, b)
  if (wallT === null) return roofT
  if (roofT === null) return wallT
  return Math.min(wallT, roofT)
}

/** Finite vertical cylinder between y0 and h: lateral surface plus the two cap discs. */
function rayVsCylinder(origin: Vector3, dir: Vector3, b: Building): number | null {
  const r = cylRadius(b)
  const ox = origin.x - b.x
  const oz = origin.z - b.z
  let best: number | null = null
  const consider = (t: number): void => {
    if (t > 0.01 && (best === null || t < best)) best = t
  }

  // lateral surface
  const a = dir.x * dir.x + dir.z * dir.z
  if (a > 1e-12) {
    const bq = 2 * (ox * dir.x + oz * dir.z)
    const cq = ox * ox + oz * oz - r * r
    const disc = bq * bq - 4 * a * cq
    if (disc >= 0) {
      const sq = Math.sqrt(disc)
      for (const t of [(-bq - sq) / (2 * a), (-bq + sq) / (2 * a)]) {
        const y = origin.y + dir.y * t
        if (y >= b.y0 && y <= b.h) consider(t)
      }
    }
  }

  // cap discs at y0 and h
  if (Math.abs(dir.y) > 1e-12) {
    for (const capY of [b.y0, b.h]) {
      const t = (capY - origin.y) / dir.y
      const x = ox + dir.x * t
      const z = oz + dir.z * t
      if (x * x + z * z <= r * r) consider(t)
    }
  }
  return best
}

function rayVsGable(origin: Vector3, dir: Vector3, b: Building): number | null {
  const eave = eaveHeight(b)
  const rise = b.h - eave
  const alongX = b.ridgeAxis === 'x'
  const halfA = (alongX ? b.w : b.d) / 2
  const halfC = (alongX ? b.d : b.w) / 2
  const oa = alongX ? origin.x - b.x : origin.z - b.z
  const oc = alongX ? origin.z - b.z : origin.x - b.x
  const da = alongX ? dir.x : dir.z
  const dc = alongX ? dir.z : dir.x
  const slope = rise / halfC
  let best: number | null = null

  // two roof planes: y = h - slope * (s * c)
  for (const s of [-1, 1]) {
    const denom = dir.y + slope * s * dc
    if (Math.abs(denom) < 1e-9) continue
    const t = (b.h - slope * s * oc - origin.y) / denom
    if (t <= 0.01 || (best !== null && t >= best)) continue
    const c = oc + t * dc
    const a = oa + t * da
    const y = origin.y + t * dir.y
    if (s * c < -1e-6 || s * c > halfC + 1e-6) continue
    if (Math.abs(a) > halfA + 1e-6) continue
    if (y < eave - 1e-6 || y > b.h + 1e-6) continue
    best = t
  }

  // triangular gable end walls at a = ±halfA
  if (Math.abs(da) > 1e-9) {
    for (const s of [-1, 1]) {
      const t = (s * halfA - oa) / da
      if (t <= 0.01 || (best !== null && t >= best)) continue
      const c = oc + t * dc
      const y = origin.y + t * dir.y
      if (Math.abs(c) > halfC + 1e-6) continue
      if (y < eave - 1e-6) continue
      if (y > b.h - slope * Math.abs(c) + 1e-6) continue
      best = t
    }
  }
  return best
}

function rayVsAabb(
  origin: Vector3,
  dir: Vector3,
  b: Building,
  minYVal: number,
  maxY: number,
): number | null {
  const min = [b.x - b.w / 2, minYVal, b.z - b.d / 2]
  const max = [b.x + b.w / 2, maxY, b.z + b.d / 2]
  const o = [origin.x, origin.y, origin.z]
  const d = [dir.x, dir.y, dir.z]
  let tNear = -Infinity
  let tFar = Infinity
  for (let axis = 0; axis < 3; axis++) {
    const oa = o[axis]!
    const da = d[axis]!
    if (Math.abs(da) < 1e-9) {
      if (oa < min[axis]! || oa > max[axis]!) return null
      continue
    }
    let t1 = (min[axis]! - oa) / da
    let t2 = (max[axis]! - oa) / da
    if (t1 > t2) {
      const tmp = t1
      t1 = t2
      t2 = tmp
    }
    tNear = Math.max(tNear, t1)
    tFar = Math.min(tFar, t2)
    if (tNear > tFar) return null
  }
  if (tFar < 0) return null
  return tNear >= 0 ? tNear : null
}

function rayVsWall(origin: Vector3, dir: Vector3, radius: number, height: number): number | null {
  const a = dir.x * dir.x + dir.z * dir.z
  if (a < 1e-9) return null
  const b = 2 * (origin.x * dir.x + origin.z * dir.z)
  const c = origin.x * origin.x + origin.z * origin.z - radius * radius
  const disc = b * b - 4 * a * c
  if (disc < 0) return null
  const sqrtDisc = Math.sqrt(disc)
  for (const t of [(-b - sqrtDisc) / (2 * a), (-b + sqrtDisc) / (2 * a)]) {
    if (t <= 0.01) continue
    const y = origin.y + dir.y * t
    if (y >= 0 && y <= height) return t
  }
  return null
}

// ---------------------------------------------------------------------------
// Broadphase: a uniform grid over building footprints. The v2 city carries well
// over a thousand solids and every geometry query above runs inside the 120 Hz
// sim (often per titan), so linear scans are out. The index rebuilds lazily
// whenever buildings.length changes, which keeps hand-built test arenas honest.
// ---------------------------------------------------------------------------

const INDEX_CELL = 17

export interface BuildingIndex {
  cell: number
  extent: number
  size: number
  buckets: Array<number[] | undefined>
  /** Per-building visited stamp so rect/ray queries test each building once. */
  stamp: Uint32Array
  stampGen: number
  count: number
}

function buildIndex(arena: Arena): BuildingIndex {
  const extent = arena.wallRadius + 24
  const size = Math.ceil((extent * 2) / INDEX_CELL)
  const index: BuildingIndex = {
    cell: INDEX_CELL,
    extent,
    size,
    buckets: new Array<number[] | undefined>(size * size),
    stamp: new Uint32Array(arena.buildings.length),
    stampGen: 0,
    count: arena.buildings.length,
  }
  arena.buildings.forEach((b, bi) => {
    const x0 = cellIndex(index, b.x - b.w / 2)
    const x1 = cellIndex(index, b.x + b.w / 2)
    const z0 = cellIndex(index, b.z - b.d / 2)
    const z1 = cellIndex(index, b.z + b.d / 2)
    for (let iz = z0; iz <= z1; iz++) {
      for (let ix = x0; ix <= x1; ix++) {
        const key = iz * index.size + ix
        ;(index.buckets[key] ??= []).push(bi)
      }
    }
  })
  return index
}

function cellIndex(index: BuildingIndex, v: number): number {
  const i = Math.floor((v + index.extent) / index.cell)
  return Math.max(0, Math.min(index.size - 1, i))
}

export function ensureIndex(arena: Arena): BuildingIndex {
  if (!arena.index || arena.index.count !== arena.buildings.length) {
    arena.index = buildIndex(arena)
  }
  return arena.index
}

function bucketAtPoint(index: BuildingIndex, x: number, z: number): number[] | undefined {
  if (Math.abs(x) > index.extent || Math.abs(z) > index.extent) return undefined
  return index.buckets[cellIndex(index, z) * index.size + cellIndex(index, x)]
}

/** Visits every building whose footprint could touch the rect, exactly once each. */
function forEachInRect(
  arena: Arena,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  visit: (b: Building) => void,
): void {
  const index = ensureIndex(arena)
  index.stampGen++
  const x0 = cellIndex(index, minX)
  const x1 = cellIndex(index, maxX)
  const z0 = cellIndex(index, minZ)
  const z1 = cellIndex(index, maxZ)
  for (let iz = z0; iz <= z1; iz++) {
    for (let ix = x0; ix <= x1; ix++) {
      const bucket = index.buckets[iz * index.size + ix]
      if (!bucket) continue
      for (const bi of bucket) {
        if (index.stamp[bi] === index.stampGen) continue
        index.stamp[bi] = index.stampGen
        visit(arena.buildings[bi]!)
      }
    }
  }
}

/**
 * Nearest building hit along the ray, walking index cells in order (2D DDA) so the
 * march can stop as soon as the next cell begins beyond the best hit so far.
 */
function raycastBuildings(
  arena: Arena,
  origin: Vector3,
  dir: Vector3,
  maxT: number,
): number | null {
  const index = ensureIndex(arena)
  index.stampGen++
  let bestT: number | null = null
  let limit = maxT

  const testBucket = (bucket: number[] | undefined): void => {
    if (!bucket) return
    for (const bi of bucket) {
      if (index.stamp[bi] === index.stampGen) continue
      index.stamp[bi] = index.stampGen
      const t = rayVsBuilding(origin, dir, arena.buildings[bi]!)
      if (t !== null && t > 0.01 && t < limit) {
        limit = t
        bestT = t
      }
    }
  }

  const horiz = Math.hypot(dir.x, dir.z)
  if (horiz < 1e-9) {
    // straight up or down: only the column under the origin matters
    testBucket(bucketAtPoint(index, origin.x, origin.z))
    return bestT
  }

  let ix = cellIndex(index, origin.x)
  let iz = cellIndex(index, origin.z)
  const stepX = dir.x > 0 ? 1 : -1
  const stepZ = dir.z > 0 ? 1 : -1
  const cellEdgeX = -index.extent + (ix + (stepX > 0 ? 1 : 0)) * index.cell
  const cellEdgeZ = -index.extent + (iz + (stepZ > 0 ? 1 : 0)) * index.cell
  let tMaxX = Math.abs(dir.x) < 1e-9 ? Infinity : (cellEdgeX - origin.x) / dir.x
  let tMaxZ = Math.abs(dir.z) < 1e-9 ? Infinity : (cellEdgeZ - origin.z) / dir.z
  const tDeltaX = Math.abs(dir.x) < 1e-9 ? Infinity : index.cell / Math.abs(dir.x)
  const tDeltaZ = Math.abs(dir.z) < 1e-9 ? Infinity : index.cell / Math.abs(dir.z)

  for (let guard = 0; guard < index.size * 2 + 4; guard++) {
    testBucket(index.buckets[iz * index.size + ix])
    const tNext = Math.min(tMaxX, tMaxZ)
    if (tNext > limit) break
    if (tMaxX < tMaxZ) {
      ix += stepX
      tMaxX += tDeltaX
    } else {
      iz += stepZ
      tMaxZ += tDeltaZ
    }
    if (ix < 0 || iz < 0 || ix >= index.size || iz >= index.size) break
  }
  return bestT
}
