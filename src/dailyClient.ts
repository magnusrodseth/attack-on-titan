/**
 * Client-side Daily Expedition state (de-008): the free-play seed, the local anti-practice mark,
 * and the "this run is today's daily" context that has to survive a reload.
 *
 * The roll itself is `src/sim/daily.ts` and the boards are the Worker's — this module owns only
 * what the browser has to remember between page loads. The pure helpers are unit-tested; the
 * localStorage wrappers around them are thin I/O and verified live, like the rest of main.ts.
 */

/** A fresh free-play course. Random so today's daily line cannot be rehearsed by accident on a
 *  plain "Deploy" (de-002 §6) — the daily is now the only shared course, and it is server-sealed. */
export function randomSeed(rand: () => number): string {
  return `sow-${Math.floor(rand() * 0x7fffffff).toString(36)}`
}

const MARK_CAP = 60

/** Record that this device deployed the daily on `date`. Deduped and capped so it cannot grow
 *  without bound; the tail is dropped oldest-first (recent dates are the ones that gate a claim). */
export function addMark(marks: readonly string[], date: string): string[] {
  if (marks.includes(date)) return [...marks]
  return [...marks, date].slice(-MARK_CAP)
}

export function isMarked(marks: readonly string[], date: string): boolean {
  return marks.includes(date)
}

// --- localStorage glue -------------------------------------------------------

const MARK_KEY = 'aot-daily-marks'
const ACTIVE_KEY = 'aot-daily-active'
const UNDERSTOOD_KEY = 'aot-daily-understood'

/** The run currently under way IS today's daily: carried across a reload so the client keeps
 *  treating it as a daily (no Restart, result routed to the daily submit) after the page rebuilds. */
export interface DailyActive {
  date: string
  seed: string
  /** false when the claim did not post a row (signed out): the run plays, it just will not rank. */
  ranked: boolean
}

export function loadMarks(): string[] {
  try {
    const raw = localStorage.getItem(MARK_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

/** True once this device has deployed today's daily — ranked, unranked or signed-out. A marked
 *  date refuses a fresh claim, which is what turns the practice loophole from a click into a
 *  devtools command (de-003). */
export function hasDeployed(date: string): boolean {
  return isMarked(loadMarks(), date)
}

export function markDeployed(date: string): void {
  try {
    localStorage.setItem(MARK_KEY, JSON.stringify(addMark(loadMarks(), date)))
  } catch {
    // private mode: the mark just does not persist, and the server claim still gates ranked play
  }
}

export function loadActiveDaily(): DailyActive | null {
  try {
    const raw = localStorage.getItem(ACTIVE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<DailyActive>
    return typeof parsed.date === 'string' && typeof parsed.seed === 'string'
      ? { date: parsed.date, seed: parsed.seed, ranked: parsed.ranked === true }
      : null
  } catch {
    return null
  }
}

export function setActiveDaily(active: DailyActive): void {
  try {
    localStorage.setItem(ACTIVE_KEY, JSON.stringify(active))
  } catch {
    // the run save carries the same daily date as a fallback, so this is a nicety
  }
}

export function clearActiveDaily(): void {
  try {
    localStorage.removeItem(ACTIVE_KEY)
  } catch {
    // nothing to clear
  }
}

/** The commitment warning fires once per device, not every day: daily friction fights the very
 *  habit the mode exists to build, and the plate already says "one attempt" in plain sight. */
export function dailyUnderstood(): boolean {
  try {
    return localStorage.getItem(UNDERSTOOD_KEY) === '1'
  } catch {
    return false
  }
}

export function rememberDailyUnderstood(): void {
  try {
    localStorage.setItem(UNDERSTOOD_KEY, '1')
  } catch {
    // private mode: they will simply see the one-time warning again next session
  }
}
