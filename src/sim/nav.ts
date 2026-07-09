import type { Arena } from './city'

/**
 * Street-grid navigation for titans. The city is axis-aligned rectangles on a regular
 * street grid, so a walkable grid + A* is the right "navmesh" here: fully deterministic,
 * cheap to bake from the arena (derived data — never persisted), and unit-testable.
 * Building footprints are inflated by a clearance so paths keep titan bodies off walls;
 * the physical collision resolve remains as the safety net for the biggest titans.
 */
export interface NavGrid {
  cell: number
  extent: number
  size: number
  walkable: Uint8Array
}

const CELL = 2
const CLEARANCE = 1.6
const SQRT2 = Math.SQRT2

function toIndex(grid: NavGrid, x: number): number {
  return Math.floor((x + grid.extent) / grid.cell)
}

function toWorld(grid: NavGrid, i: number): number {
  return -grid.extent + (i + 0.5) * grid.cell
}

function cellWalkable(grid: NavGrid, ix: number, iz: number): boolean {
  if (ix < 0 || iz < 0 || ix >= grid.size || iz >= grid.size) return false
  return grid.walkable[iz * grid.size + ix] === 1
}

export function isWalkable(grid: NavGrid, x: number, z: number): boolean {
  return cellWalkable(grid, toIndex(grid, x), toIndex(grid, z))
}

export function buildNavGrid(arena: Arena, clearance = CLEARANCE, cell = CELL): NavGrid {
  const extent = arena.wallRadius
  const size = Math.ceil((extent * 2) / cell)
  const grid: NavGrid = { cell, extent, size, walkable: new Uint8Array(size * size) }

  const wallLimit = arena.wallRadius - 2
  for (let iz = 0; iz < size; iz++) {
    for (let ix = 0; ix < size; ix++) {
      const x = toWorld(grid, ix)
      const z = toWorld(grid, iz)
      if (Math.hypot(x, z) < wallLimit) grid.walkable[iz * size + ix] = 1
    }
  }

  for (const b of arena.buildings) {
    const x0 = Math.max(0, toIndex(grid, b.x - b.w / 2 - clearance))
    const x1 = Math.min(size - 1, toIndex(grid, b.x + b.w / 2 + clearance))
    const z0 = Math.max(0, toIndex(grid, b.z - b.d / 2 - clearance))
    const z1 = Math.min(size - 1, toIndex(grid, b.z + b.d / 2 + clearance))
    for (let iz = z0; iz <= z1; iz++) {
      for (let ix = x0; ix <= x1; ix++) {
        grid.walkable[iz * size + ix] = 0
      }
    }
  }
  return grid
}

/** Nearest walkable cell centre, searched in deterministic expanding rings. */
export function nearestWalkable(grid: NavGrid, x: number, z: number): [number, number] {
  const cx = toIndex(grid, x)
  const cz = toIndex(grid, z)
  for (let r = 0; r < grid.size; r++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue // ring perimeter only
        if (cellWalkable(grid, cx + dx, cz + dz)) {
          return [toWorld(grid, cx + dx), toWorld(grid, cz + dz)]
        }
      }
    }
  }
  return [x, z]
}

/** True when every cell along the segment is walkable (used for path smoothing). */
export function lineWalkable(
  grid: NavGrid,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
): boolean {
  const dist = Math.hypot(x1 - x0, z1 - z0)
  const steps = Math.max(1, Math.ceil(dist / (grid.cell * 0.45)))
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    if (!isWalkable(grid, x0 + (x1 - x0) * t, z0 + (z1 - z0) * t)) return false
  }
  return true
}

const MAX_EXPANSIONS = 20000

/**
 * A* over the street grid (8-connected, no corner cutting), smoothed by line of sight.
 * Returns world-space waypoints ending at the goal cell, or null when unreachable.
 */
export function findPath(
  grid: NavGrid,
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
): [number, number][] | null {
  const [sx, sz] = nearestWalkable(grid, fromX, fromZ)
  const [gx, gz] = nearestWalkable(grid, toX, toZ)
  const start = toIndex(grid, sz) * grid.size + toIndex(grid, sx)
  const goal = toIndex(grid, gz) * grid.size + toIndex(grid, gx)
  if (start === goal) return [[gx, gz]]

  const size = grid.size
  const g = new Float64Array(size * size).fill(Infinity)
  const came = new Int32Array(size * size).fill(-1)
  const closed = new Uint8Array(size * size)
  const goalIx = goal % size
  const goalIz = Math.floor(goal / size)

  const octile = (ix: number, iz: number): number => {
    const dx = Math.abs(ix - goalIx)
    const dz = Math.abs(iz - goalIz)
    return (Math.max(dx, dz) + (SQRT2 - 1) * Math.min(dx, dz)) * grid.cell
  }

  // binary min-heap on f, ties broken by larger g (closer to goal) then index
  const heap: number[] = []
  const fScore = new Float64Array(size * size).fill(Infinity)
  const less = (a: number, b: number): boolean =>
    fScore[a]! !== fScore[b]! ? fScore[a]! < fScore[b]! : g[a]! !== g[b]! ? g[a]! > g[b]! : a < b
  const push = (node: number): void => {
    heap.push(node)
    let i = heap.length - 1
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (!less(heap[i]!, heap[parent]!)) break
      ;[heap[i], heap[parent]] = [heap[parent]!, heap[i]!]
      i = parent
    }
  }
  const pop = (): number => {
    const top = heap[0]!
    const last = heap.pop()!
    if (heap.length > 0) {
      heap[0] = last
      let i = 0
      for (;;) {
        const l = i * 2 + 1
        const r = l + 1
        let best = i
        if (l < heap.length && less(heap[l]!, heap[best]!)) best = l
        if (r < heap.length && less(heap[r]!, heap[best]!)) best = r
        if (best === i) break
        ;[heap[i], heap[best]] = [heap[best]!, heap[i]!]
        i = best
      }
    }
    return top
  }

  g[start] = 0
  fScore[start] = octile(start % size, Math.floor(start / size))
  push(start)
  let expansions = 0

  while (heap.length > 0 && expansions < MAX_EXPANSIONS) {
    const current = pop()
    if (closed[current]) continue
    if (current === goal) break
    closed[current] = 1
    expansions++
    const ix = current % size
    const iz = Math.floor(current / size)
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dz === 0) continue
        const nx = ix + dx
        const nz = iz + dz
        if (!cellWalkable(grid, nx, nz)) continue
        // no corner cutting: a diagonal needs both orthogonal cells open
        if (dx !== 0 && dz !== 0 && (!cellWalkable(grid, ix + dx, iz) || !cellWalkable(grid, ix, iz + dz)))
          continue
        const neighbor = nz * size + nx
        if (closed[neighbor]) continue
        const cost = g[current]! + (dx !== 0 && dz !== 0 ? SQRT2 : 1) * grid.cell
        if (cost < g[neighbor]!) {
          g[neighbor] = cost
          came[neighbor] = current
          fScore[neighbor] = cost + octile(nx, nz)
          push(neighbor)
        }
      }
    }
  }

  if (came[goal] === -1 && goal !== start) return null

  // reconstruct, then greedily skip waypoints with clear line of sight
  const cells: [number, number][] = []
  for (let node = goal; node !== -1; node = came[node]!) {
    cells.push([toWorld(grid, node % size), toWorld(grid, Math.floor(node / size))])
  }
  cells.reverse()
  const smoothed: [number, number][] = []
  let anchor: [number, number] = [sx, sz]
  let i = 0
  while (i < cells.length - 1) {
    let j = cells.length - 1
    while (j > i + 1 && !lineWalkable(grid, anchor[0], anchor[1], cells[j]![0], cells[j]![1])) j--
    smoothed.push(cells[j]!)
    anchor = cells[j]!
    i = j
  }
  if (smoothed.length === 0) smoothed.push(cells[cells.length - 1]!)
  return smoothed
}
