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
    desc: '+60% air control, +30% air boost',
    apply(p) {
      p.config.airControl *= 1.6
      p.config.airBoostThrust *= 1.3
    },
  },
  {
    id: 'thrusters',
    name: 'Tuned Thrusters',
    desc: '+20% gas thrust',
    apply(p) {
      p.config.gasThrust *= 1.2
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
