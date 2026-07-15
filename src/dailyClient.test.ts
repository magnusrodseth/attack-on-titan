import { describe, expect, test } from 'vitest'
import { addMark, isMarked, randomSeed } from './dailyClient'

describe('the free-play seed', () => {
  test('is prefixed and derived from the injected randomness', () => {
    // injected rand keeps this deterministic — the point is the shape, not the value
    expect(randomSeed(() => 0)).toBe('sow-0')
    expect(randomSeed(() => 0.5)).toMatch(/^sow-[0-9a-z]+$/)
  })

  test('two draws differ, so a plain Deploy does not land on a shared course', () => {
    let n = 0
    const rand = () => [0.11, 0.83][n++]!
    expect(randomSeed(rand)).not.toBe(randomSeed(rand))
  })
})

describe('the local anti-practice mark', () => {
  test('a deployed date reads back as marked', () => {
    const marks = addMark([], '2026-07-15')
    expect(isMarked(marks, '2026-07-15')).toBe(true)
    expect(isMarked(marks, '2026-07-14')).toBe(false)
  })

  test('marking the same date twice does not duplicate it', () => {
    const once = addMark([], '2026-07-15')
    const twice = addMark(once, '2026-07-15')
    expect(twice).toEqual(['2026-07-15'])
  })

  test('the list is capped so it cannot grow without bound', () => {
    let marks: string[] = []
    for (let d = 1; d <= 80; d++) marks = addMark(marks, `2026-01-${String(d).padStart(2, '0')}`)
    expect(marks.length).toBe(60)
    // dropped oldest-first: the 20 earliest go, the recent dates that actually gate a claim stay
    expect(marks.at(-1)).toBe('2026-01-80')
    expect(marks[0]).toBe('2026-01-21')
    expect(isMarked(marks, '2026-01-05')).toBe(false)
    expect(isMarked(marks, '2026-01-79')).toBe(true)
  })

  test('addMark does not mutate the input', () => {
    const original = ['2026-07-14']
    addMark(original, '2026-07-15')
    expect(original).toEqual(['2026-07-14'])
  })
})
