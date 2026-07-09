---
type: wayfinder:grilling
status: closed
assignee: claude (autonomous session, 2026-07-09)
blocked-by: []
---

## Question

What is the core loop, and what specifically makes it fun and replayable?

## Resolution

**Fantasy**: you are the blade. First-person ODM swinging through a walled low-poly city, cutting
napes at speed, one wave at a time, until the titans get you.

**Controls** (pointer lock): mouse look · LMB/RMB fire+hold left/right hook at crosshair ·
Space = gas (thrust toward anchors when hooked, camera-forward jump/boost otherwise) ·
Shift = reel in · W/A/S/D ground run + light air control · F = blade slash · R = resupply at station.

**Combat rule**: slash near a nape at speed ≥ kill threshold → one-cut kill with meat-slice effect;
slower → chip damage and bounce-off. Body hits blunt your blade for little damage. Titan grabs/swats
take one of three hearts.

**Replayability engine**:
1. *Skill expression*: speed-scaled damage means routes and swing mastery are the progression.
2. *Escalating waves*: count, size, speed and abnormal ratio grow per wave; abnormals leap.
3. *Roguelite upgrades*: after each wave, pick 1 of 3 seeded offers (bigger gas tank, sharper
   blades, longer/faster ropes, third heart refill, kill-refund gas...). Runs diverge.
4. *Style scoring*: base per kill × multipliers for overspeed, airtime, kill chains; combo decays.
   Best score + best wave persist in localStorage.
5. *Seeded city*: `?seed=` in URL; same seed = same city + waves + upgrade offers, so runs are
   shareable and practicable; default seed changes daily.
6. *Resource pressure*: finite gas and blade durability; resupply station at the city center forces
   risky mid-wave trips.

**Aesthetic**: original low-poly (no licensed AoT assets); glowing red nape for readability; FOV
kick + wind streaks at speed to sell velocity.
