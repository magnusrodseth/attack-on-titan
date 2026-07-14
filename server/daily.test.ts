import { describe, expect, test } from 'vitest'
import { DAILY_MODE_IDS } from '../src/sim/daily'
import {
  buildStandings,
  currentStreak,
  metricForMode,
  parseDailyResult,
  rankDay,
  type RankableRun,
} from './daily'

const run = (over: Partial<RankableRun> & Pick<RankableRun, 'username' | 'metric'>): RankableRun => ({
  timeS: null,
  level: null,
  score: null,
  wave: null,
  submittedAt: 0,
  ...over,
})

describe('the metric table', () => {
  test('every mode the daily can roll has a metric', () => {
    // the guard that keeps de-004 §1 honest: add a mode to the daily pool and forget to say what
    // it is judged on, and the board would silently rank everyone equal. Fail here instead.
    for (const mode of DAILY_MODE_IDS) expect(metricForMode(mode), mode).not.toBeNull()
  })

  test('a mode outside the pool has none', () => {
    expect(metricForMode('bossrush')).toBeNull()
    expect(metricForMode('nonsense')).toBeNull()
  })
})

describe('reading a result', () => {
  test('the mode decides the shape, and the body cannot argue', () => {
    expect(parseDailyResult('race', { timeS: 92.5 })).toEqual({
      metric: 'time',
      timeS: 92.5,
      level: null,
      score: null,
      wave: null,
    })
    expect(parseDailyResult('hunt', { level: 4, score: 900 })?.metric).toBe('level')
    expect(parseDailyResult('waves', { score: 1200, wave: 7 })?.metric).toBe('score')
  })

  test('a payload that does not fit its discipline is rejected, not coerced', () => {
    // a race result posted for a Culling day is a stitched-together payload
    expect(parseDailyResult('hunt', { timeS: 92.5 })).toBeNull()
    expect(parseDailyResult('waves', { level: 3 })).toBeNull()
    expect(parseDailyResult('race', { level: 3, score: 1 })).toBeNull()
  })

  test('bossrush can never post: it does not roll', () => {
    expect(parseDailyResult('bossrush', { score: 10, wave: 1 })).toBeNull()
  })

  test('implausible numbers are gates, not anti-cheat', () => {
    expect(parseDailyResult('race', { timeS: 0.5 })).toBeNull() // no legal line is that fast
    expect(parseDailyResult('race', { timeS: 999_999 })).toBeNull()
    expect(parseDailyResult('hunt', { level: 0, score: 0 })).toBeNull()
    expect(parseDailyResult('waves', { score: -1, wave: 1 })).toBeNull()
    expect(parseDailyResult('waves', { score: 5, wave: 1.5 })).toBeNull()
  })

  test('an empty body posts nothing', () => {
    expect(parseDailyResult('race', null)).toBeNull()
  })
})

describe('ranking a day (de-004 §1)', () => {
  test('time ranks lowest, earliest submitted breaks the tie', () => {
    const ranked = rankDay([
      run({ username: 'slow', metric: 'time', timeS: 120 }),
      run({ username: 'late', metric: 'time', timeS: 90, submittedAt: 200 }),
      run({ username: 'early', metric: 'time', timeS: 90, submittedAt: 100 }),
    ])
    expect(ranked.map((r) => r.username)).toEqual(['early', 'late', 'slow'])
  })

  test('level ranks highest, score breaks the tie, then earliest', () => {
    const ranked = rankDay([
      run({ username: 'shallow', metric: 'level', level: 2, score: 9999 }),
      run({ username: 'deep-low', metric: 'level', level: 5, score: 100 }),
      run({ username: 'deep-high', metric: 'level', level: 5, score: 800 }),
    ])
    expect(ranked.map((r) => r.username)).toEqual(['deep-high', 'deep-low', 'shallow'])
  })

  test('score ranks highest, wave breaks the tie', () => {
    const ranked = rankDay([
      run({ username: 'fewer-waves', metric: 'score', score: 500, wave: 3 })
      ,
      run({ username: 'more-waves', metric: 'score', score: 500, wave: 6 }),
      run({ username: 'top', metric: 'score', score: 900, wave: 1 }),
    ])
    expect(ranked.map((r) => r.username)).toEqual(['top', 'more-waves', 'fewer-waves'])
  })

  test('it does not mutate the rows it is given', () => {
    const rows = [
      run({ username: 'b', metric: 'time', timeS: 20 }),
      run({ username: 'a', metric: 'time', timeS: 10 }),
    ]
    rankDay(rows)
    expect(rows.map((r) => r.username)).toEqual(['b', 'a'])
  })
})

describe('the streak (de-004 §3)', () => {
  const today = '2026-07-14'

  test('consecutive finishes ending today', () => {
    expect(currentStreak(['2026-07-12', '2026-07-13', '2026-07-14'], today)).toBe(3)
  })

  test('it survives a day you have not run YET', () => {
    // the whole point of "alive if today or yesterday": a player mid-streak who opens the game at
    // 09:00 before running must not be told their streak is already gone.
    expect(currentStreak(['2026-07-12', '2026-07-13'], today)).toBe(2)
  })

  test('a missed day breaks it to zero', () => {
    expect(currentStreak(['2026-07-10', '2026-07-11', '2026-07-12'], today)).toBe(0)
  })

  test('a gap only counts the run ending at the anchor', () => {
    expect(currentStreak(['2026-07-01', '2026-07-13', '2026-07-14'], today)).toBe(2)
  })

  test('no results at all is zero, not a crash', () => {
    expect(currentStreak([], today)).toBe(0)
  })

  test('it walks across a month boundary', () => {
    expect(currentStreak(['2026-06-29', '2026-06-30', '2026-07-01'], '2026-07-01')).toBe(3)
  })

  test('abandoning breaks it: claims are not results', () => {
    // the teeth behind de-003. This function is only ever fed *posted* dates; a claim with no
    // submit simply is not here, which is exactly how quitting costs the streak.
    expect(currentStreak(['2026-07-12'], today)).toBe(0)
  })
})

describe('the Standings (de-004 §4)', () => {
  const today = '2026-07-14'

  test('expeditions and finished are both shown, and the gap is the abandoned runs', () => {
    const [row] = buildStandings(
      [
        {
          username: 'quitter',
          claimed: ['2026-07-12', '2026-07-13', '2026-07-14'],
          finished: ['2026-07-14'],
          won: [],
        },
      ],
      today,
    )
    expect(row!.expeditions).toBe(3)
    expect(row!.finished).toBe(1)
    expect(row!.expeditions - row!.finished).toBe(2)
  })

  test('ordered by wins, then streak, then finished', () => {
    const standings = buildStandings(
      [
        { username: 'streaker', claimed: [], finished: ['2026-07-13', '2026-07-14'], won: [] },
        { username: 'champion', claimed: [], finished: ['2026-07-14'], won: ['2026-07-13'] },
        { username: 'grinder', claimed: [], finished: ['2026-07-01', '2026-07-02'], won: [] },
      ],
      today,
    )
    expect(standings.map((s) => s.username)).toEqual(['champion', 'streaker', 'grinder'])
  })

  test('the streak in the table is the live one', () => {
    const [row] = buildStandings(
      [{ username: 'a', claimed: [], finished: ['2026-07-13', '2026-07-14'], won: [] }],
      today,
    )
    expect(row!.streak).toBe(2)
  })

  test('no podium column exists yet, by decision', () => {
    const [row] = buildStandings([{ username: 'a', claimed: [], finished: [], won: [] }], today)
    expect(Object.keys(row!).sort()).toEqual(['expeditions', 'finished', 'streak', 'username', 'won'])
  })
})
