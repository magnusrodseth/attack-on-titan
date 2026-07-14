import { Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import type { Arena, Building } from './city'
import {
  SHAFT_LIP,
  TITAN_HEADROOM,
  baseGroundY,
  ceilingHeightAt,
  clampTitanToArena,
  clampToCeiling,
  clampToWall,
  emptyArena,
  groundHeightAt,
  insideBuildingXZ,
  maxTitanHeightAt,
  titanRoamRadius,
  raycastHookTarget,
  rayVsBuilding,
  resolveBuildingCollision,
  surfaceHeightAt,
} from './city'
import { generateCity } from './citygen'
import { createRng } from './rng'

function house(overrides: Partial<Building> = {}): Building {
  return {
    x: 0,
    z: 0,
    w: 10,
    d: 10,
    y0: 0,
    h: 20,
    kind: 'house',
    ridgeAxis: 'x',
    tint: 0.5,
    ...overrides,
  }
}

function singleBuildingArena(overrides: Partial<Building> = {}): Arena {
  const arena = emptyArena()
  arena.buildings.push(house(overrides))
  return arena
}

describe('groundHeightAt', () => {
  it('returns ridge height on the ridge line and 0 outside the footprint', () => {
    const arena = singleBuildingArena()
    expect(groundHeightAt(arena, 0, 0, Infinity)).toBe(20) // ridge runs along x at z=0
    expect(groundHeightAt(arena, 100, 100, Infinity)).toBe(0)
  })

  it('follows the gable slope down toward the eaves', () => {
    const arena = singleBuildingArena() // ridgeAxis x, w=d=10, h=20, eave = 14
    const midSlope = groundHeightAt(arena, 0, 2.5, Infinity) // halfway down the south slope
    expect(midSlope).toBeCloseTo(17, 0)
    const nearEave = groundHeightAt(arena, 0, 4.9, Infinity)
    expect(nearEave).toBeLessThan(14.5)
    expect(nearEave).toBeGreaterThan(13.5)
  })

  it('treats flat-topped props as standable surfaces', () => {
    const arena = singleBuildingArena({ kind: 'cart', w: 2, d: 3, h: 1.4 })
    expect(groundHeightAt(arena, 0.5, 1, Infinity)).toBeCloseTo(1.4)
  })

  it('ignores an elevated deck while your feet are below its base (one-way platform)', () => {
    const arena = singleBuildingArena({ kind: 'deck', y0: 4, h: 5.5 })
    expect(groundHeightAt(arena, 0, 0, 0)).toBe(0) // running underneath
    expect(groundHeightAt(arena, 0, 0, 4.2)).toBe(5.5) // feet cleared the base: caught
    expect(groundHeightAt(arena, 0, 0, 8)).toBe(5.5) // falling onto it from above
  })

  it('returns the canal bed inside the canal strip', () => {
    const arena = emptyArena()
    arena.canal = { x: 60, halfWidth: 6, bedY: -1.8, waterY: -0.9 }
    expect(baseGroundY(arena, 60, 40)).toBe(-1.8)
    expect(baseGroundY(arena, 50, 40)).toBe(0)
    expect(groundHeightAt(arena, 61, -30, Infinity)).toBe(-1.8)
  })
})

describe('surfaceHeightAt', () => {
  it('peaks pyramids at the center and slopes to the eaves', () => {
    const tower = house({ kind: 'tower', w: 12, d: 12, h: 40 }) // eave = 31.2
    expect(surfaceHeightAt(tower, 0, 0)).toBeCloseTo(40)
    expect(surfaceHeightAt(tower, 6, 0)).toBeCloseTo(31.2)
  })
})

describe('insideBuildingXZ', () => {
  it('detects footprints and honors negative inflate', () => {
    const arena = singleBuildingArena()
    expect(insideBuildingXZ(arena, 4, 4)).toBe(true)
    expect(insideBuildingXZ(arena, 4.9, 0, -0.3)).toBe(false)
    expect(insideBuildingXZ(arena, 6, 0)).toBe(false)
  })

  it('does not count elevated decks: standing under a bridge is not being embedded', () => {
    const arena = singleBuildingArena({ kind: 'deck', y0: 4, h: 5.5 })
    expect(insideBuildingXZ(arena, 0, 0)).toBe(false)
  })
})

describe('resolveBuildingCollision', () => {
  it('pushes the player out of a wall face and zeroes the velocity into it', () => {
    const arena = singleBuildingArena()
    const pos = new Vector3(4.5, 5, 0) // inside, closest to +x face at x=5
    const vel = new Vector3(-3, 0, 1)
    resolveBuildingCollision(arena, pos, vel, 0.5)
    expect(pos.x).toBeCloseTo(5.5)
    expect(vel.x).toBe(0)
    expect(vel.z).toBe(1)
  })

  it('ignores a player above the roof', () => {
    const arena = singleBuildingArena()
    const pos = new Vector3(0, 25, 0)
    const vel = new Vector3(1, -1, 0)
    resolveBuildingCollision(arena, pos, vel, 0.5)
    expect(pos.toArray()).toEqual([0, 25, 0])
  })

  it('does not wall-push in the roof zone above the eaves', () => {
    const arena = singleBuildingArena() // eave at 14, ridge at 20
    const pos = new Vector3(4.5, 16, 4.5) // inside footprint, above the eave, off the ridge
    const vel = new Vector3(-3, 0, 0)
    resolveBuildingCollision(arena, pos, vel, 0.5)
    expect(pos.x).toBe(4.5) // no horizontal shove; the ground clamp owns roof contact
  })

  it('lets you pass beneath an elevated deck but blocks you at deck level', () => {
    const arena = singleBuildingArena({ kind: 'deck', y0: 4, h: 5.5 })
    const under = new Vector3(4.5, 2, 0)
    const underVel = new Vector3(-3, 0, 0)
    resolveBuildingCollision(arena, under, underVel, 0.5)
    expect(under.x).toBe(4.5) // free passage below the base

    const at = new Vector3(4.5, 4.8, 0)
    const atVel = new Vector3(-3, 0, 0)
    resolveBuildingCollision(arena, at, atVel, 0.5)
    expect(at.x).toBeCloseTo(5.5) // the deck edge is solid
  })
})

describe('clampToWall', () => {
  it('keeps the player inside the wall ring and kills outward radial velocity', () => {
    const arena = emptyArena()
    const pos = new Vector3(arena.wallRadius + 10, 5, 0)
    const vel = new Vector3(20, 0, 4)
    clampToWall(arena, pos, vel, 1)
    expect(Math.hypot(pos.x, pos.z)).toBeCloseTo(arena.wallRadius - 1)
    expect(vel.x).toBeLessThanOrEqual(0)
    expect(vel.z).toBeCloseTo(4)
  })
})

describe('raycastHookTarget', () => {
  it('hits a building face along the ray', () => {
    const arena = singleBuildingArena()
    const hit = raycastHookTarget(arena, new Vector3(20, 5, 0), new Vector3(-1, 0, 0), 100)
    expect(hit).not.toBeNull()
    expect(hit!.x).toBeCloseTo(5)
    expect(hit!.y).toBeCloseTo(5)
  })

  it('returns null beyond max range', () => {
    const arena = singleBuildingArena()
    const hit = raycastHookTarget(arena, new Vector3(20, 5, 0), new Vector3(-1, 0, 0), 10)
    expect(hit).toBeNull()
  })

  it('hits the wall ring for long horizontal shots', () => {
    const arena = emptyArena()
    const hit = raycastHookTarget(arena, new Vector3(0, 5, 0), new Vector3(1, 0, 0), 500)
    expect(hit).not.toBeNull()
    expect(Math.hypot(hit!.x, hit!.z)).toBeCloseTo(arena.wallRadius)
  })

  it('returns null for a shot into the sky', () => {
    const arena = emptyArena()
    const hit = raycastHookTarget(arena, new Vector3(0, 5, 0), new Vector3(0, 1, 0), 500)
    expect(hit).toBeNull()
  })

  it('hooks onto the gable slope, not an invisible box above the eaves', () => {
    const arena = singleBuildingArena() // ridge along x at z=0: slope from eave 14 to ridge 20
    const hit = raycastHookTarget(arena, new Vector3(0, 16, 20), new Vector3(0, 0, -1), 100)
    expect(hit).not.toBeNull()
    // surface height 16 lies at |z| = 5 * (1 - (16-14)/6) ≈ 3.33 on the near slope
    expect(hit!.z).toBeCloseTo(3.33, 1)
    expect(hit!.y).toBeCloseTo(16, 1)
  })

  it('lets rays pass through the air beside the ridge', () => {
    const arena = singleBuildingArena()
    // above the eave corner (z=4.9, y=19) the roof surface is ~14.1; a ray there at y 19 misses
    const hit = raycastHookTarget(arena, new Vector3(0, 19, 4.9), new Vector3(1, 0, 0), 20)
    expect(hit).toBeNull()
  })

  it('passes under an elevated deck but hooks its edge at deck height', () => {
    const arena = singleBuildingArena({ kind: 'deck', y0: 4, h: 5.5, w: 16, d: 6 })
    // a level shot below the base sails clean through (nothing else in range)
    expect(raycastHookTarget(arena, new Vector3(-20, 2, 0), new Vector3(1, 0, 0), 100)).toBeNull()
    // a shot at deck height hits the deck side
    const at = raycastHookTarget(arena, new Vector3(-20, 4.8, 0), new Vector3(1, 0, 0), 100)
    expect(at!.x).toBeCloseTo(-8)
  })

  it('hits a thin flagpole when aimed straight at it', () => {
    const arena = singleBuildingArena({ kind: 'flagpole', w: 0.35, d: 0.35, h: 45 })
    const hit = raycastHookTarget(arena, new Vector3(-30, 40, 0), new Vector3(1, 0, 0), 100)
    expect(hit).not.toBeNull()
    expect(hit!.x).toBeCloseTo(-0.175)
  })
})

describe('broadphase index', () => {
  it('matches a brute-force linear scan on a full generated city', () => {
    const arena = generateCity(createRng(7))
    const rng = createRng(99)
    for (let i = 0; i < 300; i++) {
      const x = (rng() * 2 - 1) * arena.wallRadius
      const z = (rng() * 2 - 1) * arena.wallRadius
      const feetY = rng() * 30
      let expected = baseGroundY(arena, x, z)
      for (const b of arena.buildings) {
        if (b.y0 > feetY + 0.3) continue
        const s = surfaceHeightAt(b, x, z)
        if (s > 0 && s > expected) expected = s
      }
      expect(groundHeightAt(arena, x, z, feetY)).toBeCloseTo(expected, 10)
    }
  })

  it('raycasts through the index identically to scanning every building', () => {
    const arena = generateCity(createRng(11))
    const rng = createRng(1234)
    for (let i = 0; i < 250; i++) {
      // stay 110m from the wall so the 90m ray can never reach it: buildings only
      const origin = new Vector3((rng() * 2 - 1) * 150, 2 + rng() * 40, (rng() * 2 - 1) * 150)
      const dir = new Vector3(rng() * 2 - 1, rng() * 1.2 - 0.5, rng() * 2 - 1)
      if (dir.lengthSq() < 1e-6) continue
      dir.normalize()
      const hit = raycastHookTarget(arena, origin, dir, 90)
      let best = Infinity
      for (const b of arena.buildings) {
        const s = rayVsBuilding(origin, dir, b)
        if (s !== null && s > 0.01 && s < best) best = s
      }
      if (best > 90) {
        expect(hit).toBeNull()
      } else {
        expect(hit).not.toBeNull()
        expect(hit!.clone().sub(origin).length()).toBeCloseTo(best, 6)
      }
    }
  })

  it('rebuilds automatically when a test arena gains buildings after a query', () => {
    const arena = emptyArena()
    expect(groundHeightAt(arena, 0, 0, Infinity)).toBe(0)
    arena.buildings.push(house())
    expect(groundHeightAt(arena, 0, 0, Infinity)).toBe(20)
  })
})

// --- cylinder solids (rock pillars, stalactites) ---------------------------------------

function pillar(overrides: Partial<Building> = {}): Building {
  return house({ kind: 'pillar', shape: 'cyl', w: 10, d: 10, h: 30, ...overrides })
}

describe('cylinder buildings', () => {
  it('surface height is flat inside the radius and zero outside — corners are open air', () => {
    const b = pillar()
    expect(surfaceHeightAt(b, 2, 3)).toBe(30) // hypot 3.6 < r 5
    expect(surfaceHeightAt(b, 4, 4)).toBe(0) // hypot 5.66 > 5: a box would say 30 here
  })

  it('insideBuildingXZ tests the disc, not the bounding square', () => {
    const arena = singleBuildingArena({ kind: 'pillar', shape: 'cyl', h: 30 })
    expect(insideBuildingXZ(arena, 3, 3)).toBe(true)
    expect(insideBuildingXZ(arena, 4, 4)).toBe(false)
    expect(insideBuildingXZ(arena, 4, 4, 2)).toBe(true) // inflate 2: 5.66 < 7
  })

  it('collision pushes radially out and kills only the inward velocity', () => {
    const arena = singleBuildingArena({ kind: 'pillar', shape: 'cyl', h: 30 })
    const pos = new Vector3(2.5, 1, 2.5)
    const vel = new Vector3(-3, 0, 1)
    resolveBuildingCollision(arena, pos, vel, 0.5)
    expect(Math.hypot(pos.x, pos.z)).toBeCloseTo(5.5, 6)
    expect(pos.x).toBeCloseTo(pos.z, 6) // pushed along the radial normal
    const inward = vel.x * (pos.x / 5.5) + vel.z * (pos.z / 5.5)
    expect(inward).toBeGreaterThanOrEqual(-1e-9)
  })

  it('collision above the top or below an elevated base is a pass-through', () => {
    const arena = singleBuildingArena({ kind: 'stalactite', shape: 'cyl', y0: 20, h: 30 })
    const pos = new Vector3(2, 5, 0)
    const vel = new Vector3(1, 0, 0)
    resolveBuildingCollision(arena, pos, vel, 0.5)
    expect(pos.x).toBe(2) // flying beneath the hanging rock
  })

  it('raycasts the lateral surface and the caps', () => {
    const b = pillar()
    const side = rayVsBuilding(new Vector3(-20, 5, 0), new Vector3(1, 0, 0), b)
    expect(side).toBeCloseTo(15, 6)
    const top = rayVsBuilding(new Vector3(0, 40, 0), new Vector3(0, -1, 0), b)
    expect(top).toBeCloseTo(10, 6)
    const above = rayVsBuilding(new Vector3(-20, 35, 0), new Vector3(1, 0, 0), b)
    expect(above).toBeNull()
    // an off-center ray enters at the chord, later than the diameter would
    const chord = rayVsBuilding(new Vector3(-20, 5, 4.4), new Vector3(1, 0, 0), b)
    expect(chord).toBeCloseTo(20 - Math.sqrt(25 - 4.4 * 4.4), 4)
  })

  it('hooks anchor on the pillar surface through the arena raycast', () => {
    const arena = singleBuildingArena({ kind: 'pillar', shape: 'cyl', h: 30 })
    const hit = raycastHookTarget(arena, new Vector3(-40, 8, 0), new Vector3(1, 0, 0), 90)
    expect(hit).not.toBeNull()
    expect(hit!.x).toBeCloseTo(-5, 6)
  })
})

// --- cavern ceiling (the Underground) ----------------------------------------------------

function cavernArena(): Arena {
  const arena = emptyArena()
  arena.cavern = { centerY: 44, edgeY: 22, shafts: [], torches: [] }
  arena.wallHeight = 22
  return arena
}

describe('cavern ceiling', () => {
  it('is a paraboloid: centerY at the middle, edgeY at the wall', () => {
    const arena = cavernArena()
    expect(ceilingHeightAt(arena, 0, 0)).toBeCloseTo(44)
    expect(ceilingHeightAt(arena, 260, 0)).toBeCloseTo(22)
    expect(ceilingHeightAt(arena, 130, 0)).toBeCloseTo(38.5) // 22 + 22 * (1 - 0.25)
    expect(ceilingHeightAt(emptyArena(), 0, 0)).toBe(Infinity)
  })

  it('hooks anchor on the ceiling straight overhead and at an angle', () => {
    const arena = cavernArena()
    const up = raycastHookTarget(arena, new Vector3(0, 10, 0), new Vector3(0, 1, 0), 90)
    expect(up).not.toBeNull()
    expect(up!.y).toBeCloseTo(44, 4)

    const angled = raycastHookTarget(
      arena,
      new Vector3(130, 10, 0),
      new Vector3(0.4, 0.8, 0).normalize(),
      90,
    )
    expect(angled).not.toBeNull()
    // the anchor sits exactly on the dome surface
    expect(angled!.y).toBeCloseTo(ceilingHeightAt(arena, angled!.x, angled!.z), 4)
  })

  it('buildings still win over the ceiling when they are closer', () => {
    const arena = cavernArena()
    arena.buildings.push(house({ h: 20 }))
    const hit = raycastHookTarget(arena, new Vector3(0, 25, 0), new Vector3(0, 1, 0), 90)
    expect(hit!.y).toBeCloseTo(44, 4) // straight up from above the roof: ceiling
    const roof = raycastHookTarget(arena, new Vector3(0, 5, 0.1), new Vector3(0, 1, 0), 90)
    expect(roof!.y).toBeLessThan(21) // under the roof: the gable catches it first
  })

  it('a shaft is a hole: no hook anchor in it, and a soldier may climb into the opening', () => {
    const arena = cavernArena()
    arena.cavern!.shafts.push({ x: 0, z: 0, radius: 12 })

    // straight up through the middle of the opening: nothing to grab, only sky
    expect(raycastHookTarget(arena, new Vector3(0, 10, 0), new Vector3(0, 1, 0), 90)).toBeNull()
    // the rim is real stone and still catches
    const rim = raycastHookTarget(arena, new Vector3(30, 10, 0), new Vector3(0, 1, 0), 90)
    expect(rim).not.toBeNull()
    expect(rim!.y).toBeCloseTo(ceilingHeightAt(arena, 30, 0), 4)

    // and the climb: under the opening you may rise a body's length past the rock line
    const pos = new Vector3(0, 60, 0)
    const vel = new Vector3(0, 5, 0)
    clampToCeiling(arena, pos, vel, 1)
    expect(pos.y).toBeCloseTo(ceilingHeightAt(arena, 0, 0) + SHAFT_LIP - 1, 6)
    expect(vel.y).toBe(0)
  })

  it('clampToCeiling keeps the soldier under the rock and kills upward velocity', () => {
    const arena = cavernArena()
    const pos = new Vector3(0, 43.5, 0)
    const vel = new Vector3(0, 5, 0)
    clampToCeiling(arena, pos, vel, 1)
    expect(pos.y).toBeCloseTo(43, 6)
    expect(vel.y).toBe(0)

    // no cavern: a no-op
    const openPos = new Vector3(0, 500, 0)
    const openVel = new Vector3(0, 5, 0)
    clampToCeiling(emptyArena(), openPos, openVel, 1)
    expect(openPos.y).toBe(500)
    expect(openVel.y).toBe(5)
  })
})

/**
 * The headroom rule that lets titans live under a cavern roof. maxTitanHeightAt and
 * titanRoamRadius are exact inverses of each other: cap a titan's height to the headroom
 * where it stands and its roam radius is exactly that spot, so it can always walk inward
 * toward the tall middle and never outward into the rock.
 */
describe('cavern headroom', () => {
  function cavernArena(): Arena {
    const a = emptyArena()
    a.wallRadius = 240
    a.cavern = { centerY: 44, edgeY: 22, shafts: [], torches: [] }
    return a
  }

  it('has no ceiling to duck under in the open sky', () => {
    expect(maxTitanHeightAt(emptyArena(), 0, 0)).toBe(Infinity)
    expect(titanRoamRadius(emptyArena(), 60)).toBe(emptyArena().wallRadius)
  })

  it('caps a titan to the rock above its head, tallest at the centre', () => {
    const a = cavernArena()
    expect(maxTitanHeightAt(a, 0, 0)).toBeCloseTo(44 - TITAN_HEADROOM)
    // out at the rim the roof is low, so only a short titan fits
    expect(maxTitanHeightAt(a, 240, 0)).toBeCloseTo(22 - TITAN_HEADROOM)
    expect(maxTitanHeightAt(a, 120, 0)).toBeLessThan(maxTitanHeightAt(a, 0, 0))
  })

  it('inverts: a titan capped where it stands may stand exactly there', () => {
    const a = cavernArena()
    for (const r of [0, 40, 120, 200, 239]) {
      const h = maxTitanHeightAt(a, r, 0)
      expect(titanRoamRadius(a, h)).toBeCloseTo(r, 4)
    }
  })

  it('pens a tall titan into the tall middle of the cavern', () => {
    const a = cavernArena()
    const tall = titanRoamRadius(a, 40)
    const short = titanRoamRadius(a, 15)
    expect(tall).toBeGreaterThan(0)
    expect(tall).toBeLessThan(short)
    expect(short).toBeLessThanOrEqual(a.wallRadius)
  })

  it('walks a titan back under the rock when it strays too far out', () => {
    const a = cavernArena()
    const pos = new Vector3(230, 0, 0) // rim: roof is 22m, way too low for a 40m titan
    const vel = new Vector3(6, 0, 0)
    clampTitanToArena(a, pos, vel, 40)
    const r = Math.hypot(pos.x, pos.z)
    expect(r).toBeCloseTo(titanRoamRadius(a, 40))
    // and its head is genuinely under the rock now, which is the whole point
    expect(40 + TITAN_HEADROOM).toBeLessThanOrEqual(ceilingHeightAt(a, pos.x, pos.z) + 1e-6)
    expect(vel.x).toBeLessThanOrEqual(0) // outward speed killed, not reflected
  })

  it('still fences titans inside the wall on an open map', () => {
    const a = emptyArena() // wallRadius 260, no roof
    const pos = new Vector3(400, 0, 0)
    clampTitanToArena(a, pos, new Vector3(1, 0, 0), 15)
    expect(Math.hypot(pos.x, pos.z)).toBeLessThanOrEqual(260)
  })

  it('leaves a titan already under good rock alone', () => {
    const a = cavernArena()
    const pos = new Vector3(10, 0, 0)
    const vel = new Vector3(3, 0, 2)
    clampTitanToArena(a, pos, vel, 20)
    expect(pos.x).toBe(10)
    expect(vel.x).toBe(3)
  })
})
