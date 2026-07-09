export interface Rng {
  (): number
  /** Internal u32 stream state; feed it to resumeRng to continue this stream later. */
  state(): number
}

function rngFromState(initial: number): Rng {
  let state = initial >>> 0
  const next = (() => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }) as Rng
  next.state = () => state
  return next
}

/** Deterministic RNG so cities, waves and upgrade offers replay identically per seed. */
export function createRng(seed: number): Rng {
  return rngFromState(seed)
}

/** Continues a stream captured mid-run (page-refresh persistence relies on this). */
export function resumeRng(state: number): Rng {
  return rngFromState(state)
}

export function hashSeed(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function shuffle<T>(rng: () => number, items: T[]): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = out[i]!
    out[i] = out[j]!
    out[j] = tmp
  }
  return out
}
