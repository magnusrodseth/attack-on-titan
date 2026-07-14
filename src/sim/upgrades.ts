import type { PlayerState } from './player'
import { shuffle } from './rng'

export interface Upgrade {
  id: string
  name: string
  desc: string
  apply: (p: PlayerState) => void
}

export const UPGRADE_POOL: Upgrade[] = [
  {
    id: 'gas-tank',
    name: 'Expanded Gas Tank',
    desc: '+40% gas capacity, tank refilled',
    apply(p) {
      p.config.maxGas = Math.round(p.config.maxGas * 1.4)
      p.gas = p.config.maxGas
    },
  },
  {
    id: 'sharp-blades',
    name: 'Ultrahard Steel',
    desc: 'One-cut speed threshold -15%',
    apply(p) {
      p.config.killSpeed *= 0.85
    },
  },
  {
    id: 'hair-trigger',
    name: 'Hair-Trigger Rig',
    desc: '-30% swing recovery, so the next cut comes back sooner',
    apply(p) {
      // Stacks multiplicatively and unbounded, like Ultrahard Steel — deliberately safe here:
      // the swing is edge-triggered on a press, not held, so past a few tenths of a second the
      // limiter stops being this timer and becomes the finger. Blade wear pays for the rest.
      p.config.slashCooldown *= 0.7
    },
  },
  {
    id: 'long-cables',
    name: 'Extended Cables',
    desc: '+25% hook range',
    apply(p) {
      p.config.hookRange *= 1.25
    },
  },
  {
    id: 'fast-reel',
    name: 'Winch Overdrive',
    desc: '+50% reel speed',
    apply(p) {
      p.config.reelSpeed *= 1.5
    },
  },
  {
    id: 'extra-blades',
    name: 'Spare Blade Racks',
    desc: '+2 blade pairs, now and at resupply',
    apply(p) {
      p.config.bladePairs += 2
      p.blades += 2
      if (p.bladeHp <= 0) p.bladeHp = p.config.bladeDurability
    },
  },
  {
    id: 'whetstone',
    name: 'Whetstone',
    desc: '+3 edge on every blade pair, honed now',
    apply(p) {
      // Spare Blade Racks gives you more pairs; this gives each pair a longer life. The two are
      // different answers to a dry rig, and Hair-Trigger makes both of them matter more.
      p.config.bladeDurability += 3
      if (p.blades > 0) p.bladeHp = p.config.bladeDurability
    },
  },
  {
    id: 'long-reach',
    name: "Executioner's Reach",
    desc: '+25% blade reach: a wider nape to find at speed',
    apply(p) {
      p.config.slashRange *= 1.25
    },
  },
  {
    id: 'heavy-ordnance',
    name: 'Heavy Ordnance',
    desc: '+30% thunder spear blast radius',
    apply(p) {
      // caught spears already in the air keep the radius they were fired with — the spear is
      // the thing that carries the charge, and it left the rack before this crate arrived
      p.config.blastRadius *= 1.3
    },
  },
  {
    id: 'escape-artist',
    name: 'Escape Artist',
    desc: 'Tear out of a fist in 5 fewer mashes',
    apply(p) {
      // a floor, not a race to zero: an escape you do not have to fight for is not a QTE
      p.config.grabEscapePresses = Math.max(5, p.config.grabEscapePresses - 5)
    },
  },
  {
    id: 'field-kit',
    name: 'Field Kit',
    desc: '+1 full restock per wave, no station needed',
    apply(p) {
      p.config.fieldKits += 1
      p.kits += 1 // the crate is on your back now, not next wave
    },
  },
  {
    id: 'heart',
    name: "Survivor's Resolve",
    desc: '+1 heart, fully healed',
    apply(p) {
      p.config.maxHp += 1
      p.hp = p.config.maxHp
    },
  },
  {
    id: 'spare-canister',
    name: 'Spare Canister',
    desc: '+1 gas canister, now and at resupply',
    apply(p) {
      p.config.gasCanisters += 1
      p.canisters += 1
    },
  },
  {
    id: 'spear-racks',
    name: 'Reinforced Spear Racks',
    desc: '+2 spear capacity, +2 spears now',
    apply(p) {
      p.config.spearCapacity += 2
      p.spears += 2
    },
  },
  {
    id: 'gas-refund',
    name: 'Combat Scavenging',
    desc: 'Each kill refunds 12 gas',
    apply(p) {
      p.config.gasKillRefund += 12
    },
  },
  {
    id: 'wind-dancer',
    name: 'Wind Dancer',
    desc: '+60% air control, and it keeps pulling to higher speeds',
    apply(p) {
      p.config.airControl *= 1.6
      p.config.airControlCeiling *= 1.25
    },
  },
  {
    id: 'thrusters',
    name: 'Tuned Thrusters',
    desc: '+25% dash impulse',
    apply(p) {
      p.config.boostImpulse *= 1.25
    },
  },
]

export function offerUpgrades(rng: () => number, count = 3): Upgrade[] {
  return shuffle(rng, UPGRADE_POOL).slice(0, count)
}

export function applyUpgrade(p: PlayerState, id: string): void {
  const upgrade = UPGRADE_POOL.find((u) => u.id === id)
  if (!upgrade) throw new Error(`Unknown upgrade: ${id}`)
  upgrade.apply(p)
}
