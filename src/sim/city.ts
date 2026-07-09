import { Vector3 } from 'three'
import { shuffle } from './rng'

/**
 * AoT-district city (see wayfinder ticket 007): dense low row-houses with gabled roofs,
 * scattered church towers as high anchors, a central plaza with the resupply station,
 * all ringed by a 50m wall. `h` is total height including the roof ridge and is what
 * hooks and collision use; the renderer draws eaves below it.
 */
export interface Building {
  x: number
  z: number
  w: number
  d: number
  h: number
  kind: 'house' | 'tower'
  ridgeAxis: 'x' | 'z'
  tint: number
}

export interface Arena {
  buildings: Building[]
  wallRadius: number
  wallHeight: number
  plazaRadius: number
  station: Vector3
}

const BLOCK = 34
const STREET_HALF = 3
const CELL_HALF = BLOCK / 2 - STREET_HALF // usable half-extent of a block

export function emptyArena(): Arena {
  return {
    buildings: [],
    wallRadius: 170,
    wallHeight: 50,
    plazaRadius: 22,
    station: new Vector3(0, 0, 0),
  }
}

export function generateCity(rng: () => number): Arena {
  const arena = emptyArena()
  const cells: Array<{ cx: number; cz: number }> = []
  const margin = CELL_HALF + 2
  for (let gx = -5; gx <= 5; gx++) {
    for (let gz = -5; gz <= 5; gz++) {
      const cx = gx * BLOCK
      const cz = gz * BLOCK
      if (Math.hypot(Math.abs(cx) + margin, Math.abs(cz) + margin) >= arena.wallRadius) continue
      const nearestX = Math.max(Math.abs(cx) - CELL_HALF, 0)
      const nearestZ = Math.max(Math.abs(cz) - CELL_HALF, 0)
      if (Math.hypot(nearestX, nearestZ) <= arena.plazaRadius + 1) continue
      cells.push({ cx, cz })
    }
  }

  const order = shuffle(rng, cells)
  const towerCells = new Set(order.slice(0, 6 + Math.floor(rng() * 3)))
  for (const cell of cells) {
    if (towerCells.has(cell)) {
      arena.buildings.push({
        x: cell.cx,
        z: cell.cz,
        w: 12,
        d: 12,
        h: 36 + rng() * 12,
        kind: 'tower',
        ridgeAxis: rng() < 0.5 ? 'x' : 'z',
        tint: rng(),
      })
      continue
    }
    if (rng() < 0.08) continue // market square
    fillRowHouses(arena, cell.cx, cell.cz, rng)
  }
  return arena
}

function fillRowHouses(arena: Arena, cx: number, cz: number, rng: () => number): void {
  const alongX = rng() < 0.5
  const rowDepth = 10 + rng() * 3
  for (const side of [-1, 1]) {
    const rowOffset = side * (CELL_HALF - rowDepth / 2)
    let cursor = -CELL_HALF
    while (cursor < CELL_HALF - 5) {
      let width = 8 + rng() * 4
      if (cursor + width > CELL_HALF - 5) width = CELL_HALF - cursor // absorb the tail
      const center = cursor + width / 2
      const height = 14 + rng() * 8
      arena.buildings.push({
        x: alongX ? cx + center : cx + rowOffset,
        z: alongX ? cz + rowOffset : cz + center,
        w: alongX ? width : rowDepth,
        d: alongX ? rowDepth : width,
        h: height,
        kind: 'house',
        ridgeAxis: alongX ? 'x' : 'z',
        tint: rng(),
      })
      cursor += width
    }
  }
}

/** Fraction of total height where the walls end and the roof begins. */
export function eaveHeight(b: Building): number {
  return b.h * (b.kind === 'tower' ? 0.78 : 0.7)
}

/** Height of the building surface (wall top, gable slope, or spire) at a point, 0 outside. */
export function surfaceHeightAt(b: Building, x: number, z: number): number {
  const dx = x - b.x
  const dz = z - b.z
  if (Math.abs(dx) > b.w / 2 || Math.abs(dz) > b.d / 2) return 0
  const eave = eaveHeight(b)
  const rise = b.h - eave
  if (b.kind === 'tower') {
    // pyramid spire
    const t = Math.max(Math.abs(dx) / (b.w / 2), Math.abs(dz) / (b.d / 2))
    return eave + rise * (1 - t)
  }
  const cross = b.ridgeAxis === 'x' ? Math.abs(dz) / (b.d / 2) : Math.abs(dx) / (b.w / 2)
  return eave + rise * (1 - cross)
}

export function groundHeightAt(arena: Arena, x: number, z: number): number {
  let ground = 0
  for (const b of arena.buildings) {
    const surface = surfaceHeightAt(b, x, z)
    if (surface > ground) ground = surface
  }
  return ground
}

/** True when the XZ point is inside a building footprint (inflate < 0 shrinks it). */
export function insideBuildingXZ(arena: Arena, x: number, z: number, inflate = 0): boolean {
  for (const b of arena.buildings) {
    if (Math.abs(x - b.x) < b.w / 2 + inflate && Math.abs(z - b.z) < b.d / 2 + inflate) return true
  }
  return false
}

export function resolveBuildingCollision(
  arena: Arena,
  pos: Vector3,
  vel: Vector3,
  radius: number,
): void {
  for (const b of arena.buildings) {
    // walls only push below the eaves; the ground clamp owns roof-slope contact
    if (pos.y >= eaveHeight(b)) continue
    const ex = b.w / 2 + radius
    const ez = b.d / 2 + radius
    const dx = pos.x - b.x
    const dz = pos.z - b.z
    if (Math.abs(dx) >= ex || Math.abs(dz) >= ez) continue
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
  }
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

/** Analytic hook raycast against building AABBs and the wall ring. Returns the anchor point. */
export function raycastHookTarget(
  arena: Arena,
  origin: Vector3,
  dir: Vector3,
  maxRange: number,
): Vector3 | null {
  let bestT = maxRange
  let found = false

  for (const b of arena.buildings) {
    const t = rayVsBuilding(origin, dir, b)
    if (t !== null && t < bestT && t > 0.01) {
      bestT = t
      found = true
    }
  }

  const tWall = rayVsWall(origin, dir, arena.wallRadius, arena.wallHeight)
  if (tWall !== null && tWall < bestT && tWall > 0.01) {
    bestT = tWall
    found = true
  }

  if (!found) return null
  return origin.clone().addScaledVector(dir, bestT)
}

/** Walls up to the eaves, then real gable slopes (houses) or the full box (towers). */
function rayVsBuilding(origin: Vector3, dir: Vector3, b: Building): number | null {
  if (b.kind === 'tower') return rayVsAabb(origin, dir, b, b.h)
  const wallT = rayVsAabb(origin, dir, b, eaveHeight(b))
  const roofT = rayVsGable(origin, dir, b)
  if (wallT === null) return roofT
  if (roofT === null) return wallT
  return Math.min(wallT, roofT)
}

function rayVsGable(origin: Vector3, dir: Vector3, b: Building): number | null {
  const eave = eaveHeight(b)
  const rise = b.h - eave
  const alongX = b.ridgeAxis === 'x'
  const halfA = (alongX ? b.w : b.d) / 2
  const halfC = (alongX ? b.d : b.w) / 2
  const oa = (alongX ? origin.x - b.x : origin.z - b.z)
  const oc = (alongX ? origin.z - b.z : origin.x - b.x)
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

function rayVsAabb(origin: Vector3, dir: Vector3, b: Building, maxY: number): number | null {
  const min = [b.x - b.w / 2, 0, b.z - b.d / 2]
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
