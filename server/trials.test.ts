import { describe, expect, it } from 'vitest'
import { huntImproves, parseTrialPost, raceImproves } from './trials'

describe('parseTrialPost', () => {
  it('accepts a well-formed race post with ascending splits ending at the time', () => {
    const post = parseTrialPost({
      mode: 'race',
      seed: 'trost',
      timeS: 62.31,
      splits: [4.1, 9.8, 20.2, 62.31],
    })
    expect(post).toMatchObject({ mode: 'race', seed: 'trost', timeS: 62.31 })
  })

  it('rejects malformed race posts', () => {
    const base = { mode: 'race', seed: 'trost', timeS: 62.31, splits: [4.1, 62.31] }
    expect(parseTrialPost(null)).toBeNull()
    expect(parseTrialPost({ ...base, seed: '' })).toBeNull()
    expect(parseTrialPost({ ...base, timeS: Number.NaN })).toBeNull()
    expect(parseTrialPost({ ...base, timeS: 1 })).toBeNull() // implausibly fast
    expect(parseTrialPost({ ...base, timeS: 90000 })).toBeNull()
    expect(parseTrialPost({ ...base, splits: [] })).toBeNull()
    expect(parseTrialPost({ ...base, splits: [62.31, 4.1] })).toBeNull() // not ascending
    expect(parseTrialPost({ ...base, splits: [4.1, 50] })).toBeNull() // last split != time
    expect(parseTrialPost({ ...base, splits: ['4.1', 62.31] })).toBeNull()
  })

  it('accepts a well-formed hunt post and rejects malformed ones', () => {
    expect(parseTrialPost({ mode: 'hunt', seed: 'trost', level: 4, score: 12800 })).toMatchObject({
      mode: 'hunt',
      level: 4,
      score: 12800,
    })
    expect(parseTrialPost({ mode: 'hunt', seed: 'trost', level: 0, score: 1 })).toBeNull()
    expect(parseTrialPost({ mode: 'hunt', seed: 'trost', level: 2.5, score: 1 })).toBeNull()
    expect(parseTrialPost({ mode: 'hunt', seed: 'trost', level: 3, score: -1 })).toBeNull()
    expect(parseTrialPost({ mode: 'waves', seed: 'trost' })).toBeNull()
  })
})

describe('keep-best comparators', () => {
  it('a race entry only improves on a strictly faster time', () => {
    expect(raceImproves(60, 59.9)).toBe(true)
    expect(raceImproves(60, 60)).toBe(false)
    expect(raceImproves(60, 61)).toBe(false)
  })

  it('a hunt entry improves on a deeper level, or the same level with more score', () => {
    expect(huntImproves({ level: 3, score: 900 }, { level: 4, score: 100 })).toBe(true)
    expect(huntImproves({ level: 3, score: 900 }, { level: 3, score: 901 })).toBe(true)
    expect(huntImproves({ level: 3, score: 900 }, { level: 3, score: 900 })).toBe(false)
    expect(huntImproves({ level: 3, score: 900 }, { level: 2, score: 99999 })).toBe(false)
  })
})
