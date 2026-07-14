import { Vector3 } from 'three'
import type { Arena, Building } from './city'
import { insideBuildingXZ } from './city'
import { createRng, hashSeed } from './rng'

/**
 * The Forest of Giant Trees (IDEAS look spec, 2026-07-13). Canon: trees around 80 m tall,
 * a maintained tourist attraction before the fall, now overgrown — the definitive ODM
 * playground. The forest is read by SCALE: the trunks are cliffs and the ordinary trees
 * between them are the bushes that prove it.
 *
 * The giants are cylinder solids (the same `shape: 'cyl'` the cavern's pillars use) and
 * their limbs are `branch` platforms — elevated one-way decks you can land on, rest on and
 * hook, at every height from the mid-story to the crown. Trunks stand 30-60 m apart against
 * a 90 m hook range, which is what makes the Tarzan-chain between giants the movement
 * identity of this map. Everything derives from `hashSeed(seed + ':forest:<purpose>')`.
 */

export const FOREST_WALL_RADIUS = 300
/** How far out a Shifter walks in from, as a fraction of the wall radius: in among the giants. */
export const FOREST_BOSS_ENTRY_FRACTION = 0.55
/** The crowns: the ceiling of the playable envelope, and the top gate band. */
export const FOREST_CANOPY_Y = 72
/** The clearing the run starts in: the meadow with the old tourist cabins. */
export const FOREST_CLEARING_RADIUS = 30

const GIANT_COUNT = 150
/** Trunks never crowd closer than this — the swing between them has to breathe. */
const GIANT_MIN_GAP = 30
const SAPLING_COUNT = 520
const CABIN_COUNT = 5
const RAY_COUNT = 7

export function generateForest(seed: string): Arena {
  const arena: Arena = {
    buildings: [],
    wallRadius: FOREST_WALL_RADIUS,
    // no wall out here: a ring of dark forest closes the world instead, and a wall of
    // height 0 means the hook raycast can never anchor on one
    wallHeight: 0,
    plazaRadius: FOREST_CLEARING_RADIUS,
    stations: [new Vector3(0, 0, 0)],
    canal: null,
    cavern: null,
    forest: { canopyY: FOREST_CANOPY_Y, rays: [] },
    gateAngle: 0,
    // set below: out here there is no gate to breach, so a Shifter simply comes through
    // the trees, and which way it comes is the seed's business
    bossEntry: new Vector3(0, 0, 0),
  }

  const bossBearing = createRng(hashSeed(`${seed}:forest:boss`))() * Math.PI * 2
  const br = FOREST_WALL_RADIUS * FOREST_BOSS_ENTRY_FRACTION
  arena.bossEntry.set(Math.cos(bossBearing) * br, 0, Math.sin(bossBearing) * br)

  const giants = placeGiants(arena, createRng(hashSeed(`${seed}:forest:giants`)))
  placeBranches(arena, giants, createRng(hashSeed(`${seed}:forest:branches`)))
  placeSaplings(arena, createRng(hashSeed(`${seed}:forest:saplings`)))
  placeCabins(arena, createRng(hashSeed(`${seed}:forest:cabins`)))
  placeRays(arena, giants, createRng(hashSeed(`${seed}:forest:rays`)))
  placeStations(arena, createRng(hashSeed(`${seed}:forest:stations`)))
  return arena
}

/**
 * The giants. Scattered on a blue-noise-ish rejection sample so no two crowd each other,
 * and never inside the clearing — that meadow is the one place you can see the sky.
 */
function placeGiants(arena: Arena, rng: () => number): Building[] {
  const giants: Building[] = []
  let guard = 0
  while (giants.length < GIANT_COUNT && guard++ < GIANT_COUNT * 60) {
    const angle = rng() * Math.PI * 2
    // sqrt keeps the scatter even across the disc instead of piling into the middle
    const r = Math.sqrt(rng()) * (FOREST_WALL_RADIUS - 18)
    const x = Math.cos(angle) * r
    const z = Math.sin(angle) * r
    const radius = 5 + rng() * 4
    if (r < FOREST_CLEARING_RADIUS + radius + 6) continue // the clearing stays open
    if (giants.some((g) => Math.hypot(g.x - x, g.z - z) < g.w / 2 + radius + GIANT_MIN_GAP))
      continue

    const trunk: Building = {
      x,
      z,
      w: radius * 2,
      d: radius * 2,
      y0: 0,
      h: 62 + rng() * 26, // 62-88 m: the canon 80 with a spread
      kind: 'trunk',
      ridgeAxis: 'x',
      tint: rng(),
      shape: 'cyl',
    }
    giants.push(trunk)
    arena.buildings.push(trunk)
  }
  return giants
}

/**
 * The limbs. Thick horizontal branches off each giant — the platforms the Scouts camp on,
 * and the anchors that make the vertical envelope climbable. Buildings are axis-aligned, so
 * a limb runs along x or z; that is invisible in a forest and keeps the collision exact.
 */
function placeBranches(arena: Arena, giants: Building[], rng: () => number): void {
  for (const trunk of giants) {
    const count = 2 + Math.floor(rng() * 3) // 2-4 limbs per giant
    for (let i = 0; i < count; i++) {
      // spread them up the trunk: the lowest are mid-story, the highest reach the crown
      const t = 0.34 + (i / Math.max(1, count - 1)) * 0.52 + (rng() - 0.5) * 0.08
      const y = trunk.h * Math.min(0.93, Math.max(0.3, t))
      const length = 15 + rng() * 13
      const thickness = 1.6 + rng() * 0.9
      const alongX = rng() < 0.5
      const side = rng() < 0.5 ? 1 : -1
      const reach = trunk.w / 2 + length / 2
      const width = 2.8 + rng() * 1.8

      arena.buildings.push({
        x: trunk.x + (alongX ? side * reach : 0),
        z: trunk.z + (alongX ? 0 : side * reach),
        w: alongX ? length : width,
        d: alongX ? width : length,
        // a one-way platform: pass under it freely, land on it from above (city.ts)
        y0: y - thickness,
        h: y,
        kind: 'branch',
        ridgeAxis: alongX ? 'x' : 'z',
        tint: trunk.tint,
      })
    }
  }
}

/**
 * The mid-story: ordinary 9-22 m trees between the giants. They are the scale cue — with
 * nothing but giants the forest reads as a normal wood, and the 80 m stops meaning anything.
 */
function placeSaplings(arena: Arena, rng: () => number): void {
  let guard = 0
  let placed = 0
  while (placed < SAPLING_COUNT && guard++ < SAPLING_COUNT * 12) {
    const angle = rng() * Math.PI * 2
    const r = Math.sqrt(rng()) * (FOREST_WALL_RADIUS - 8)
    const x = Math.cos(angle) * r
    const z = Math.sin(angle) * r
    if (r < FOREST_CLEARING_RADIUS + 4) continue
    const radius = 0.5 + rng() * 0.8
    // they grow in the gaps, not through a giant (or through each other's trunks)
    if (insideBuildingXZ(arena, x, z, radius + 2)) continue
    arena.buildings.push({
      x,
      z,
      w: radius * 2,
      d: radius * 2,
      y0: 0,
      h: 9 + rng() * 13,
      kind: 'sapling',
      ridgeAxis: 'x',
      tint: rng(),
      shape: 'cyl',
    })
    placed++
  }
}

/** The tourist era, abandoned: gabled huts ringing the clearing (the reference shot). */
function placeCabins(arena: Arena, rng: () => number): void {
  const base = rng() * Math.PI * 2
  for (let i = 0; i < CABIN_COUNT; i++) {
    const angle = base + (i / CABIN_COUNT) * Math.PI * 2 + (rng() - 0.5) * 0.4
    const r = FOREST_CLEARING_RADIUS - 8 - rng() * 5
    const x = Math.cos(angle) * r
    const z = Math.sin(angle) * r
    const w = 7 + rng() * 4
    const d = 6 + rng() * 3
    if (insideBuildingXZ(arena, x, z, Math.max(w, d) / 2 + 2)) continue
    arena.buildings.push({
      x,
      z,
      w,
      d,
      y0: 0,
      h: 6 + rng() * 2.5,
      kind: 'cabin',
      ridgeAxis: rng() < 0.5 ? 'x' : 'z',
      tint: rng(),
    })
  }
}

/**
 * Gaps in the crowns where the sun comes through — the god rays. Aimed at the wide spaces
 * between giants, because a shaft of light landing on a trunk is a shaft of light you
 * cannot see down.
 */
function placeRays(arena: Arena, giants: Building[], rng: () => number): void {
  const rays = arena.forest!.rays
  let guard = 0
  while (rays.length < RAY_COUNT && guard++ < 300) {
    const angle = rng() * Math.PI * 2
    const r = Math.sqrt(rng()) * (FOREST_WALL_RADIUS - 60)
    const x = Math.cos(angle) * r
    const z = Math.sin(angle) * r
    const radius = 7 + rng() * 9
    if (giants.some((g) => Math.hypot(g.x - x, g.z - z) < g.w / 2 + radius + 8)) continue
    if (rays.some((s) => Math.hypot(s.x - x, s.z - z) < s.radius + radius + 60)) continue
    rays.push({ x, z, radius })
  }
  // the clearing itself is the widest hole in the canopy
  rays.push({ x: 0, z: 0, radius: FOREST_CLEARING_RADIUS * 0.8 })
}

/** The clearing station, plus two out under the canopy on open floor. */
function placeStations(arena: Arena, rng: () => number): void {
  const base = rng() * Math.PI * 2
  for (const offset of [0, (Math.PI * 2) / 3]) {
    search: for (let jitter = 0; jitter < 16; jitter++) {
      const angle = base + offset + jitter * 0.2
      for (let r = 190; r > 60; r -= 7) {
        const x = Math.cos(angle) * r
        const z = Math.sin(angle) * r
        if (!insideBuildingXZ(arena, x, z, 6)) {
          arena.stations.push(new Vector3(x, 0, z))
          break search
        }
      }
    }
  }
}
