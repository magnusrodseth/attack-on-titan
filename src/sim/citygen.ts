import type { Arena, Building } from './city'
import { emptyArena, ensureIndex } from './city'
import { shuffle } from './rng'

/**
 * City generation v2 (procgen audit, 2026-07-10). The district is an offset block grid
 * so that two boulevards cross exactly at the central plaza; a canal chord cuts the
 * grid north-south with swing-under bridges; block motifs (row houses, courtyards,
 * L-blocks, warehouses, market squares) and a noise-driven height field give each
 * neighbourhood its own skyline; the sealed main gate and three wall bastions pin the
 * compass points. Everything derives from the single passed rng — same seed, same city.
 */

export const BLOCK = 34
const STREET_HALF = 3
const CELL_HALF = BLOCK / 2 - STREET_HALF // usable half-extent of a block
/** The two grand avenues run along the axes; keep them clear of buildings. */
export const BOULEVARD_HALF = 7
/** Block centers at (g + 0.5) * BLOCK for g in [-GRID, GRID-1]. */
const GRID = 8

export const CANAL_X = 2 * BLOCK // on a street line, between block columns
export const CANAL_HALF_WIDTH = 6.5
export const CANAL_BED_Y = -1.8
export const CANAL_WATER_Y = -0.9

interface Rect {
  x0: number
  x1: number
  z0: number
  z1: number
}

/** Deterministic lattice hash in [0, 1). */
function hash2(ix: number, iz: number, seed: number): number {
  let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263)) ^ seed
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t)
}

function valueNoise(x: number, z: number, cell: number, seed: number): number {
  const gx = Math.floor(x / cell)
  const gz = Math.floor(z / cell)
  const fx = smoothstep(x / cell - gx)
  const fz = smoothstep(z / cell - gz)
  const a = hash2(gx, gz, seed)
  const b = hash2(gx + 1, gz, seed)
  const c = hash2(gx, gz + 1, seed)
  const d = hash2(gx + 1, gz + 1, seed)
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz
}

export function generateCity(rng: () => number): Arena {
  const arena = emptyArena()
  arena.canal = {
    x: CANAL_X,
    halfWidth: CANAL_HALF_WIDTH,
    bedY: CANAL_BED_Y,
    waterY: CANAL_WATER_Y,
  }
  arena.gateAngle = 0

  // district fields ride their own integer seeds drawn once from the run rng
  const heightSeed = Math.floor(rng() * 0xffffffff) | 0
  const brickSeed = Math.floor(rng() * 0xffffffff) | 0

  /** Height districts: noise neighbourhoods plus a gentle rise toward the center. */
  const houseHeight = (x: number, z: number): number => {
    const n =
      0.65 * valueNoise(x, z, 95, heightSeed) + 0.35 * valueNoise(x, z, 43, heightSeed ^ 0x9e3779b9)
    // push the noise toward its extremes so quarters read as short or tall, not average
    const district = Math.min(1, Math.max(0, (n - 0.5) * 1.9 + 0.5))
    const r = Math.min(1, Math.hypot(x, z) / arena.wallRadius)
    return 11 + district * 10 + (1 - r) * 6 + rng() * 3
  }

  /** Brick quarters vs plaster quarters: the tint scalar carries the material split. */
  const facadeTint = (x: number, z: number): number => {
    const brickProb = valueNoise(x, z, 120, brickSeed) > 0.58 ? 0.78 : 0.16
    return rng() < brickProb ? rng() * 0.35 : 0.35 + rng() * 0.65
  }

  const push = (b: Building): void => {
    arena.buildings.push(b)
  }

  // ---- block grid --------------------------------------------------------
  const cells: Array<{ cx: number; cz: number; rect: Rect }> = []
  const margin = CELL_HALF + 2
  for (let gx = -GRID; gx < GRID; gx++) {
    for (let gz = -GRID; gz < GRID; gz++) {
      const cx = (gx + 0.5) * BLOCK
      const cz = (gz + 0.5) * BLOCK
      if (Math.hypot(Math.abs(cx) + margin, Math.abs(cz) + margin) >= arena.wallRadius) continue
      const nearestX = Math.max(Math.abs(cx) - CELL_HALF, 0)
      const nearestZ = Math.max(Math.abs(cz) - CELL_HALF, 0)
      if (Math.hypot(nearestX, nearestZ) <= arena.plazaRadius + 1) continue
      const rect: Rect = {
        x0: cx - CELL_HALF,
        x1: cx + CELL_HALF,
        z0: cz - CELL_HALF,
        z1: cz + CELL_HALF,
      }
      clampRectToBoulevards(rect)
      if (rect.x1 - rect.x0 < 10 || rect.z1 - rect.z0 < 10) continue
      cells.push({ cx, cz, rect })
    }
  }

  // ---- special-cell assignment -------------------------------------------
  const order = shuffle(rng, cells)
  const cathedralCell = order.find(
    (cell) =>
      Math.hypot(cell.cx, cell.cz) > 60 &&
      Math.hypot(cell.cx, cell.cz) < 160 &&
      Math.abs(cell.cx - CANAL_X) > 34,
  )
  const towerCells = new Set(
    order.filter((cell) => cell !== cathedralCell).slice(0, 13 + Math.floor(rng() * 5)),
  )

  // ---- fill blocks (grid order keeps rng consumption stable) --------------
  for (const cell of cells) {
    if (cell === cathedralCell) {
      fillCathedral(push, cell.rect, rng)
      continue
    }
    if (towerCells.has(cell)) {
      fillTower(push, cell.rect, rng)
      continue
    }
    const roll = rng()
    if (roll < 0.1) fillMarket(push, cell.rect, rng)
    else if (roll < 0.2) fillWarehouse(push, cell.rect, rng, facadeTint)
    else if (roll < 0.3) fillLBlock(push, cell.rect, rng, houseHeight, facadeTint)
    else if (roll < 0.5) fillCourtyard(push, cell.rect, rng, houseHeight, facadeTint)
    else fillRowHouses(push, cell.rect, rng, houseHeight, facadeTint)
  }

  // ---- carve the canal and the gate forecourt -----------------------------
  arena.buildings = arena.buildings.filter((b) => {
    if (Math.abs(b.x - CANAL_X) < CANAL_HALF_WIDTH + 1.5 + b.w / 2) return false
    const gateward = b.x + b.w / 2 > arena.wallRadius - 42
    if (gateward && Math.abs(b.z) - b.d / 2 < 14) return false
    return true
  })

  // ---- chimneys on the survivors: perches that break the ridgelines -------
  for (const b of [...arena.buildings]) {
    if (b.kind !== 'house') continue
    if (rng() >= 0.42) continue
    const alongX = b.ridgeAxis === 'x'
    const halfA = (alongX ? b.w : b.d) / 2
    const along = (rng() - 0.5) * Math.max(0, halfA - 1.6) * 2
    push({
      x: alongX ? b.x + along : b.x,
      z: alongX ? b.z : b.z + along,
      w: 1.05,
      d: 1.05,
      y0: 0,
      h: b.h + 1.6 + rng() * 1.1,
      kind: 'chimney',
      ridgeAxis: 'x',
      tint: rng(),
    })
  }

  addBridges(push, arena, rng)
  addGatehouse(push, arena, rng)
  addBastions(push, arena, rng)
  addPlazaMarket(push, arena, rng)

  ensureIndex(arena)
  return arena
}

/** Shrinks a block rect so nothing builds into the two crossing boulevards. */
function clampRectToBoulevards(rect: Rect): void {
  const clear = BOULEVARD_HALF + 1
  if (rect.x0 < clear && rect.x1 > -clear) {
    if (rect.x0 >= -clear && rect.x0 < clear) rect.x0 = clear
    if (rect.x1 > -clear && rect.x1 <= clear) rect.x1 = -clear
  }
  if (rect.z0 < clear && rect.z1 > -clear) {
    if (rect.z0 >= -clear && rect.z0 < clear) rect.z0 = clear
    if (rect.z1 > -clear && rect.z1 <= clear) rect.z1 = -clear
  }
}

type Push = (b: Building) => void
type HeightAt = (x: number, z: number) => number
type TintAt = (x: number, z: number) => number

/**
 * A row of gabled houses along one edge of the rect; the workhorse of every motif.
 * A gap (world coordinate along the row, half-width ~2.5) skips the houses that would
 * cover it — courtyard blocks use this to stay street-connected through an alley.
 */
function houseRow(
  push: Push,
  rect: Rect,
  edge: 'z0' | 'z1' | 'x0' | 'x1',
  rowDepth: number,
  rng: () => number,
  heightAt: HeightAt,
  tintAt: TintAt,
  gapAt: number | null = null,
): void {
  const alongX = edge === 'z0' || edge === 'z1'
  const lane = alongX
    ? edge === 'z0'
      ? rect.z0 + rowDepth / 2
      : rect.z1 - rowDepth / 2
    : edge === 'x0'
      ? rect.x0 + rowDepth / 2
      : rect.x1 - rowDepth / 2
  const from = alongX ? rect.x0 : rect.z0
  const to = alongX ? rect.x1 : rect.z1
  let cursor = from
  while (cursor < to - 5) {
    let width = 8 + rng() * 4
    if (cursor + width > to - 5) width = to - cursor // absorb the tail
    const center = cursor + width / 2
    // the alley must survive the nav grid's clearance inflation on both sides, so it
    // opens a good deal wider than a soldier needs
    if (gapAt !== null && cursor < gapAt + 3.5 && cursor + width > gapAt - 3.5) {
      cursor += width
      continue
    }
    const x = alongX ? center : lane
    const z = alongX ? lane : center
    push({
      x,
      z,
      w: alongX ? width : rowDepth,
      d: alongX ? rowDepth : width,
      y0: 0,
      h: heightAt(x, z),
      kind: 'house',
      ridgeAxis: alongX ? 'x' : 'z',
      tint: tintAt(x, z),
    })
    cursor += width
  }
}

function rowDepthFor(rect: Rect, alongX: boolean, rng: () => number): number {
  const depth = alongX ? rect.z1 - rect.z0 : rect.x1 - rect.x0
  return Math.min(10 + rng() * 3, Math.max(8, (depth - 3) / 2))
}

/** The classic block: two parallel rows facing each other across a back lane. */
function fillRowHouses(
  push: Push,
  rect: Rect,
  rng: () => number,
  heightAt: HeightAt,
  tintAt: TintAt,
): void {
  const alongX = rng() < 0.5
  const rowDepth = rowDepthFor(rect, alongX, rng)
  if (alongX) {
    houseRow(push, rect, 'z0', rowDepth, rng, heightAt, tintAt)
    houseRow(push, rect, 'z1', rowDepth, rng, heightAt, tintAt)
  } else {
    houseRow(push, rect, 'x0', rowDepth, rng, heightAt, tintAt)
    houseRow(push, rect, 'x1', rowDepth, rng, heightAt, tintAt)
  }
}

/**
 * Perimeter block: houses on all four edges around a courtyard to dive into. One row
 * leaves an alley gap so the courtyard stays street-connected — for runners on foot,
 * and for the nav grid (a sealed pocket would strand snapped course gates).
 */
function fillCourtyard(
  push: Push,
  rect: Rect,
  rng: () => number,
  heightAt: HeightAt,
  tintAt: TintAt,
): void {
  const rowDepth = Math.min(9 + rng() * 2, Math.max(8, (rect.z1 - rect.z0 - 8) / 2))
  const gapEdge = Math.floor(rng() * 4)
  const gapX = rect.x0 + 5 + rng() * (rect.x1 - rect.x0 - 10)
  const gapZ = rect.z0 + 5 + rng() * (rect.z1 - rect.z0 - 10)
  houseRow(push, rect, 'z0', rowDepth, rng, heightAt, tintAt, gapEdge === 0 ? gapX : null)
  houseRow(push, rect, 'z1', rowDepth, rng, heightAt, tintAt, gapEdge === 1 ? gapX : null)
  const sideRect: Rect = {
    x0: rect.x0,
    x1: rect.x1,
    z0: rect.z0 + rowDepth + 1,
    z1: rect.z1 - rowDepth - 1,
  }
  if (sideRect.z1 - sideRect.z0 > 6) {
    houseRow(push, sideRect, 'x0', rowDepth, rng, heightAt, tintAt, gapEdge === 2 ? gapZ : null)
    houseRow(push, sideRect, 'x1', rowDepth, rng, heightAt, tintAt, gapEdge === 3 ? gapZ : null)
  }
  const innerW = rect.x1 - rect.x0 - 2 * rowDepth
  const innerD = rect.z1 - rect.z0 - 2 * rowDepth
  if (innerW > 7 && innerD > 7 && rng() < 0.6) {
    push(wellAt((rect.x0 + rect.x1) / 2, (rect.z0 + rect.z1) / 2, rng))
  }
}

/** Two rows meeting in a corner; the open quarter gets street clutter. */
function fillLBlock(
  push: Push,
  rect: Rect,
  rng: () => number,
  heightAt: HeightAt,
  tintAt: TintAt,
): void {
  const rowDepth = rowDepthFor(rect, true, rng)
  const south = rng() < 0.5
  const west = rng() < 0.5
  houseRow(push, rect, south ? 'z0' : 'z1', rowDepth, rng, heightAt, tintAt)
  const sideRect: Rect = {
    x0: rect.x0,
    x1: rect.x1,
    z0: south ? rect.z0 + rowDepth + 1 : rect.z0,
    z1: south ? rect.z1 : rect.z1 - rowDepth - 1,
  }
  houseRow(push, sideRect, west ? 'x0' : 'x1', rowDepth, rng, heightAt, tintAt)
  const openX = west ? rect.x1 - 6 : rect.x0 + 6
  const openZ = south ? rect.z1 - 6 : rect.z0 + 6
  if (rng() < 0.7) push(cartAt(openX, openZ, rng))
}

/** One fat mid-tier building: the stepping stone between rooftops and towers. */
function fillWarehouse(push: Push, rect: Rect, rng: () => number, tintAt: TintAt): void {
  const rectW = rect.x1 - rect.x0
  const rectD = rect.z1 - rect.z0
  const w = Math.max(16, Math.min(rectW * 0.72, 24))
  const d = Math.max(16, Math.min(rectD * 0.72, 26))
  const x = (rect.x0 + rect.x1) / 2 + (rng() - 0.5) * 3
  const z = (rect.z0 + rect.z1) / 2 + (rng() - 0.5) * 3
  push({
    x,
    z,
    w,
    d,
    y0: 0,
    h: 24 + rng() * 8,
    kind: 'warehouse',
    ridgeAxis: w >= d ? 'x' : 'z',
    tint: tintAt(x, z),
  })
}

/** An open market square: a well, stalls and carts instead of missing teeth. */
function fillMarket(push: Push, rect: Rect, rng: () => number): void {
  const cx = (rect.x0 + rect.x1) / 2
  const cz = (rect.z0 + rect.z1) / 2
  push(wellAt(cx, cz, rng))
  const q = Math.min(rect.x1 - rect.x0, rect.z1 - rect.z0) / 4
  const slots = shuffle(rng, [
    [-q, -q],
    [q, -q],
    [-q, q],
    [q, q],
  ] as Array<[number, number]>)
  const stalls = 2 + Math.floor(rng() * 3)
  slots.slice(0, stalls).forEach(([ox, oz]) => {
    push({
      x: cx + ox + (rng() - 0.5) * 2,
      z: cz + oz + (rng() - 0.5) * 2,
      w: 3.4,
      d: 2.4,
      y0: 0,
      h: 2.3,
      kind: 'stall',
      ridgeAxis: rng() < 0.5 ? 'x' : 'z',
      tint: rng(),
    })
  })
  if (rng() < 0.6) push(cartAt(cx + (rng() - 0.5) * q * 2, cz + q * 1.6, rng))
}

function fillTower(push: Push, rect: Rect, rng: () => number): void {
  const x = (rect.x0 + rect.x1) / 2
  const z = (rect.z0 + rect.z1) / 2
  const h = 36 + rng() * 12
  push({ x, z, w: 12, d: 12, y0: 0, h, kind: 'tower', ridgeAxis: 'x', tint: rng() })
  push(flagpoleAt(x, z, h, rng))
}

/** Nave plus great spire: the one silhouette you can navigate by from anywhere. */
function fillCathedral(push: Push, rect: Rect, rng: () => number): void {
  const cx = (rect.x0 + rect.x1) / 2
  const cz = (rect.z0 + rect.z1) / 2
  const naveD = Math.min(22, rect.z1 - rect.z0 - 6)
  push({
    x: cx,
    z: cz + 2,
    w: 16,
    d: naveD,
    y0: 0,
    h: 29,
    kind: 'house',
    ridgeAxis: 'z',
    tint: 0.5,
  })
  const spireH = 56 + rng() * 6
  push({
    x: cx,
    z: cz - 9,
    w: 12,
    d: 12,
    y0: 0,
    h: spireH,
    kind: 'cathedral',
    ridgeAxis: 'x',
    tint: rng(),
  })
  push(flagpoleAt(cx, cz - 9, spireH, rng))
}

function wellAt(x: number, z: number, rng: () => number): Building {
  return { x, z, w: 2.4, d: 2.4, y0: 0, h: 1.2, kind: 'well', ridgeAxis: 'x', tint: rng() }
}

function cartAt(x: number, z: number, rng: () => number): Building {
  return {
    x,
    z,
    w: rng() < 0.5 ? 1.7 : 2.9,
    d: rng() < 0.5 ? 2.9 : 1.7,
    y0: 0,
    h: 1.35,
    kind: 'cart',
    ridgeAxis: 'x',
    tint: rng(),
  }
}

function flagpoleAt(x: number, z: number, baseTop: number, rng: () => number): Building {
  return {
    x,
    z,
    w: 0.35,
    d: 0.35,
    y0: 0,
    h: baseTop + 5 + rng() * 2,
    kind: 'flagpole',
    ridgeAxis: 'x',
    tint: rng(),
  }
}

/** Stone bridges over the canal: hop up the stair blocks or swing under the deck. */
function addBridges(push: Push, arena: Arena, rng: () => number): void {
  const crossings: Array<{ z: number; width: number; deckY0: number; deckTop: number }> = [
    { z: 0, width: 12, deckY0: 4.4, deckTop: 5.9 }, // the boulevard's grand bridge
    { z: -BLOCK * 3, width: 5, deckY0: 3.3, deckTop: 4.6 },
    { z: BLOCK * 3, width: 5, deckY0: 3.3, deckTop: 4.6 },
    { z: -BLOCK * 6, width: 5, deckY0: 3.3, deckTop: 4.6 },
    { z: BLOCK * 6, width: 5, deckY0: 3.3, deckTop: 4.6 },
  ]
  for (const c of crossings) {
    if (Math.abs(c.z) + c.width / 2 > arena.wallRadius - 24) continue
    push({
      x: CANAL_X,
      z: c.z,
      w: 2 * (CANAL_HALF_WIDTH + 2.2),
      d: c.width,
      y0: c.deckY0,
      h: c.deckTop,
      kind: 'deck',
      ridgeAxis: 'x',
      tint: rng(),
    })
    const deckEdge = CANAL_HALF_WIDTH + 2.2
    const STEPS = 5
    const STEP_DEPTH = 1.15
    for (const side of [-1, 1]) {
      push({
        x: CANAL_X + side * (CANAL_HALF_WIDTH + 1.1),
        z: c.z,
        w: 1.8,
        d: c.width,
        y0: CANAL_BED_Y,
        h: c.deckY0,
        kind: 'pier',
        ridgeAxis: 'x',
        tint: rng(),
      })
      // a snug staircase up each end: five even risers, the top step flush against
      // the deck edge, climbing toward the crossing
      for (let k = 0; k < STEPS; k++) {
        const stepTop = (c.deckTop * (k + 1)) / (STEPS + 1)
        const inner = deckEdge + (STEPS - 1 - k) * STEP_DEPTH
        push({
          x: CANAL_X + side * (inner + STEP_DEPTH / 2),
          z: c.z,
          w: STEP_DEPTH,
          d: c.width,
          y0: 0,
          h: stepTop,
          kind: 'pier',
          ridgeAxis: 'x',
          tint: rng(),
        })
      }
    }
  }
}

/** The sealed main gate: twin towers, a walkable span, and the flag over the door. */
function addGatehouse(push: Push, arena: Arena, rng: () => number): void {
  const R = arena.wallRadius
  for (const side of [-1, 1]) {
    push({
      x: R - 8,
      z: side * 11,
      w: 10,
      d: 10,
      y0: 0,
      h: 54,
      kind: 'gatehouse',
      ridgeAxis: 'x',
      tint: rng(),
    })
  }
  push({
    x: R - 8,
    z: 0,
    w: 10,
    d: 14,
    y0: 36,
    h: 41.5,
    kind: 'deck',
    ridgeAxis: 'x',
    tint: rng(),
  })
  push({ ...flagpoleAt(R - 8, 0, 0, rng), y0: 41.5, h: 49 })
}

/** Bastion towers at the other cardinal points: hookable compass landmarks. */
function addBastions(push: Push, arena: Arena, rng: () => number): void {
  const R = arena.wallRadius
  for (const angle of [Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
    const x = Math.cos(angle) * (R - 7)
    const z = Math.sin(angle) * (R - 7)
    const h = 52 + rng() * 4
    push({ x, z, w: 9, d: 9, y0: 0, h, kind: 'bastion', ridgeAxis: 'x', tint: rng() })
    push(flagpoleAt(x, z, h, rng))
  }
}

/** Stalls ringing the plaza: the crossroads reads as the district's market heart. */
function addPlazaMarket(push: Push, arena: Arena, rng: () => number): void {
  const radius = arena.plazaRadius + 4
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2 + 0.35 + rng() * 0.25
    const x = Math.cos(angle) * radius
    const z = Math.sin(angle) * radius
    if (Math.abs(x) < BOULEVARD_HALF + 2 || Math.abs(z) < BOULEVARD_HALF + 2) continue
    push({
      x,
      z,
      w: 3.4,
      d: 2.4,
      y0: 0,
      h: 2.3,
      kind: 'stall',
      ridgeAxis: rng() < 0.5 ? 'x' : 'z',
      tint: rng(),
    })
  }
}
