export interface ScoreState {
  score: number
  combo: number
  comboTimer: number
  kills: number
  bestChain: number
}

export interface KillInfo {
  speed: number
  airborne: boolean
  oneCut: boolean
}

export const COMBO_WINDOW = 6

export function createScore(): ScoreState {
  return { score: 0, combo: 0, comboTimer: 0, kills: 0, bestChain: 0 }
}

export function registerKill(s: ScoreState, info: KillInfo, killSpeed: number): number {
  const speedMult = Math.max(1, info.speed / killSpeed)
  const airMult = info.airborne ? 1.25 : 1
  const cutMult = info.oneCut ? 1.5 : 1
  const chainMult = 1 + 0.25 * Math.min(s.combo, 12)
  const points = Math.round(100 * speedMult * airMult * cutMult * chainMult)
  s.score += points
  s.combo += 1
  s.comboTimer = COMBO_WINDOW
  s.kills += 1
  s.bestChain = Math.max(s.bestChain, s.combo)
  return points
}

export function stepScore(s: ScoreState, dt: number): void {
  if (s.comboTimer <= 0) return
  s.comboTimer -= dt
  if (s.comboTimer <= 0) {
    s.combo = 0
    s.comboTimer = 0
  }
}
