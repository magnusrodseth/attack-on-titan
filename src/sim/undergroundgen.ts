import { Vector3 } from 'three'
import type { Arena, Building } from './city'
import { ceilingHeightAt, insideBuildingXZ } from './city'
import { createRng, hashSeed } from './rng'

/**
 * The Underground: the cavern city beneath the capital (IDEAS look spec, 2026-07-13).
 * A bowl of crammed lamplit blocks under a paraboloid rock ceiling — no sky, no horizon;
 * the map reads by its own lights. Rock pillars rise through the streets to the dome
 * (the ceiling and the pillars are the hook anchors the surface never offers), glowing
 * towers mark the skyline, and a stairway to the surface pours one great light shaft.
 * Everything derives from `hashSeed(seed + ':ug:<purpose>')` — same seed, same cavern.
 */

export const UG_WALL_RADIUS = 240
export const UG_CEILING_CENTER_Y = 44
export const UG_CEILING_EDGE_Y = 22
export const UG_PLAZA_RADIUS = 20

/** Tighter blocks than the surface district: a shelter colony, not a planned city. */
const BLOCK = 26
const STREET_HALF = 3
const CELL_HALF = BLOCK / 2 - STREET_HALF
/** Two modest cross streets meet at the plaza; no grand boulevards down here. */
const CROSS_HALF = 6
/** Buildings keep their heads this far below the rock. */
const CEILING_CLEARANCE = 5

const PILLAR_COUNT = 14
const STALACTITE_COUNT = 10
const TOWER_COUNT = 9

/** Deterministic lattice hash in [0, 1) (same construction as citygen's). */
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

export function generateUnderground(seed: string): Arena {
  const arena: Arena = {
    buildings: [],
    wallRadius: UG_WALL_RADIUS,
    wallHeight: UG_CEILING_EDGE_Y,
    plazaRadius: UG_PLAZA_RADIUS,
    stations: [new Vector3(0, 0, 0)],
    canal: null,
    cavern: { centerY: UG_CEILING_CENTER_Y, edgeY: UG_CEILING_EDGE_Y, shafts: [] },
    gateAngle: 0,
  }

  const layout = createRng(hashSeed(`${seed}:ug:layout`))
  const heightSeed = hashSeed(`${seed}:ug:heights`)
  const props = createRng(hashSeed(`${seed}:ug:props`))

  // the bowl: tall near the plaza, stooping toward the cavern edge, always under rock
  const heightAt = (x: number, z: number): number => {
    const falloff = 1 - 0.45 * (Math.hypot(x, z) / UG_WALL_RADIUS) ** 1.5
    const base = (10 + valueNoise(x, z, 44, heightSeed) * 12) * falloff
    return Math.min(Math.max(base, 7), ceilingHeightAt(arena, x, z) - CEILING_CLEARANCE)
  }

  const grid = Math.floor(UG_WALL_RADIUS / BLOCK)
  for (let gx = -grid; gx < grid; gx++) {
    for (let gz = -grid; gz < grid; gz++) {
      const cx = (gx + 0.5) * BLOCK
      const cz = (gz + 0.5) * BLOCK
      const r = Math.hypot(cx, cz)
      if (r + CELL_HALF > UG_WALL_RADIUS - 10) continue // fully inside the rock wall
      if (r < UG_PLAZA_RADIUS + CELL_HALF + 2) continue // the plaza stays open
      buildBlock(arena.buildings, cx, cz, layout, props, heightAt)
    }
  }

  placeTowers(arena, createRng(hashSeed(`${seed}:ug:towers`)))
  placePillars(arena, createRng(hashSeed(`${seed}:ug:pillars`)))
  placeStalactites(arena, createRng(hashSeed(`${seed}:ug:stalactites`)))
  placeStairway(arena, createRng(hashSeed(`${seed}:ug:stairway`)))
  placeStations(arena, createRng(hashSeed(`${seed}:ug:stations`)))
  return arena
}

/** One 26m block: crammed row houses, a courtyard, a warehouse, or a rubble yard. */
function buildBlock(
  buildings: Building[],
  cx: number,
  cz: number,
  layout: () => number,
  props: () => number,
  heightAt: (x: number, z: number) => number,
): void {
  const roll = layout()
  if (roll < 0.08) return // rubble yard: the cavern floor shows through

  if (roll < 0.18) {
    // warehouse: one broad stack, the mid-tier anchor between rooftops and towers
    const w = 15 + layout() * 4
    const d = 15 + layout() * 4
    if (Math.abs(cx) < CROSS_HALF + w / 2 || Math.abs(cz) < CROSS_HALF + d / 2) return
    buildings.push({
      x: cx,
      z: cz,
      w,
      d,
      y0: 0,
      h: Math.max(heightAt(cx, cz) + 4, 12),
      kind: 'warehouse',
      ridgeAxis: layout() < 0.5 ? 'x' : 'z',
      tint: layout(),
    })
    return
  }

  // row houses on a 2x2 sub-lot grid; the courtyard motif hollows the middle by
  // shrinking every lot toward its corner
  const courtyard = roll < 0.38
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      if (layout() < 0.06) continue // a gap: stairs and alleys thread through
      const w = 6.5 + layout() * 3.5
      const d = 6.5 + layout() * 3.5
      const inset = courtyard ? 0.5 : 1.2
      const x = cx + sx * (CELL_HALF - w / 2 - inset + layout() * 0.8)
      const z = cz + sz * (CELL_HALF - d / 2 - inset + layout() * 0.8)
      // the two cross streets meeting at the plaza stay clear for long sightlines
      if (Math.abs(x) < CROSS_HALF + w / 2 || Math.abs(z) < CROSS_HALF + d / 2) continue
      const h = heightAt(x, z) * (0.85 + layout() * 0.3)
      const house: Building = {
        x,
        z,
        w,
        d,
        y0: 0,
        h: Math.max(7, h),
        kind: 'house',
        ridgeAxis: layout() < 0.5 ? 'x' : 'z',
        tint: layout() * 0.78, // plaster and brick; slate never made it down here
      }
      buildings.push(house)

      // the references show external stone stairs climbing every other wall
      if (props() < 0.3) {
        const stairW = 2.5 + props() * 1.5
        buildings.push({
          x: house.x + (props() < 0.5 ? 1 : -1) * (w / 2 + stairW / 2),
          z: house.z + (props() - 0.5) * d * 0.5,
          w: stairW,
          d: stairW * 1.4,
          y0: 0,
          h: 2 + props() * 3.5,
          kind: 'pier',
          ridgeAxis: 'x',
          tint: props(),
        })
      }
      if (props() < 0.38) {
        buildings.push({
          x: house.x + (props() - 0.5) * w * 0.5,
          z: house.z + (props() - 0.5) * d * 0.5,
          w: 1.1,
          d: 1.1,
          y0: 0,
          h: house.h + 1.6,
          kind: 'chimney',
          ridgeAxis: 'x',
          tint: house.tint,
        })
      }
    }
  }
}

/** Slender glowing towers dot the skyline — the candles of the vista read. */
function placeTowers(arena: Arena, rng: () => number): void {
  for (let i = 0; i < TOWER_COUNT; i++) {
    const angle = rng() * Math.PI * 2
    const r = 34 + rng() * 120
    const x = Math.cos(angle) * r
    const z = Math.sin(angle) * r
    const w = 6.5 + rng() * 2.5
    const ceiling = ceilingHeightAt(arena, x, z)
    arena.buildings.push({
      x,
      z,
      w,
      d: w,
      y0: 0,
      h: Math.min(24 + rng() * 10, ceiling - 4),
      kind: 'tower',
      ridgeAxis: 'x',
      tint: rng(),
    })
  }
}

/** Giant rock columns, floor to dome. They own their footprint: houses give way. */
function placePillars(arena: Arena, rng: () => number): void {
  const placed: { x: number; z: number; r: number }[] = []
  let guard = 0
  while (placed.length < PILLAR_COUNT && guard++ < 200) {
    const angle = rng() * Math.PI * 2
    const r = 42 + rng() * 165
    const x = Math.cos(angle) * r
    const z = Math.sin(angle) * r
    const radius = 4 + rng() * 2.5
    if (placed.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + radius + 34)) continue
    placed.push({ x, z, r: radius })

    // evict anything the rock grew through (walls hugging the pillar stay)
    arena.buildings = arena.buildings.filter(
      (b) => Math.hypot(b.x - x, b.z - z) > radius + Math.hypot(b.w, b.d) / 2 - 1,
    )
    arena.buildings.push({
      x,
      z,
      w: radius * 2,
      d: radius * 2,
      y0: 0,
      h: ceilingHeightAt(arena, x, z),
      kind: 'pillar',
      ridgeAxis: 'x',
      tint: rng(),
      shape: 'cyl',
    })
  }
}

/** Hanging rock over the roofline: hookable ambience, never a street obstacle. */
function placeStalactites(arena: Arena, rng: () => number): void {
  for (let i = 0; i < STALACTITE_COUNT; i++) {
    const angle = rng() * Math.PI * 2
    const r = 24 + rng() * 190
    const x = Math.cos(angle) * r
    const z = Math.sin(angle) * r
    const ceiling = ceilingHeightAt(arena, x, z)
    const length = Math.min(5 + rng() * 7, ceiling - 20)
    if (length < 3.5) continue // the low dome near the wall keeps its rock smooth
    const w = 3 + rng() * 3
    arena.buildings.push({
      x,
      z,
      w,
      d: w,
      y0: ceiling - length,
      h: ceiling,
      kind: 'stalactite',
      ridgeAxis: 'x',
      tint: rng(),
      shape: 'cyl',
    })
  }
}

/**
 * The stairway to the surface: a run of stone steps climbing toward the cavern wall
 * under the great light shaft — the landmark the whole bowl orients by.
 */
function placeStairway(arena: Arena, rng: () => number): void {
  const angle = rng() * Math.PI * 2
  arena.gateAngle = angle
  const r = UG_WALL_RADIUS - 30
  const x = Math.cos(angle) * r
  const z = Math.sin(angle) * r
  // clear the landing so the stair run reads from across the cavern
  arena.buildings = arena.buildings.filter((b) => Math.hypot(b.x - x, b.z - z) > 26)
  for (let step = 0; step < 4; step++) {
    const t = step / 3
    arena.buildings.push({
      x: x - Math.cos(angle) * (9 - step * 6),
      z: z - Math.sin(angle) * (9 - step * 6),
      w: 13,
      d: 13,
      y0: 0,
      h: 2.5 + t * 9,
      kind: 'pier',
      ridgeAxis: 'x',
      tint: 0.5,
    })
  }
  arena.cavern!.shafts.push({ x, z, radius: 13 })
  // a second, smaller opening over the plaza edge: the birds-over-the-sewer-grate beam
  arena.cavern!.shafts.push({
    x: Math.cos(angle + 2.5) * 34,
    z: Math.sin(angle + 2.5) * 34,
    radius: 8,
  })
}

/** The plaza station plus two out in the bowl, each snapped onto open ground. */
function placeStations(arena: Arena, rng: () => number): void {
  const base = rng() * Math.PI * 2
  for (const offset of [0, (Math.PI * 2) / 3]) {
    search: for (let jitter = 0; jitter < 14; jitter++) {
      const angle = base + offset + jitter * 0.19
      // streets down here are 6m; a 4m-clear spot is a small square, and that is the point
      for (let r = 130; r > 40; r -= 6) {
        const x = Math.cos(angle) * r
        const z = Math.sin(angle) * r
        if (!insideBuildingXZ(arena, x, z, 4)) {
          arena.stations.push(new Vector3(x, 0, z))
          break search
        }
      }
    }
  }
}
