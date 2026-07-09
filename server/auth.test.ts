import { describe, expect, it } from 'vitest'
import { USERNAME_RE, hashPassword, newSessionToken, sha256Hex, verifyPassword } from './auth'

describe('auth crypto', () => {
  it('hashes and verifies a password round-trip', async () => {
    const stored = await hashPassword('wings-of-freedom')
    expect(stored.startsWith('pbkdf2$100000$')).toBe(true)
    expect(await verifyPassword('wings-of-freedom', stored)).toBe(true)
    expect(await verifyPassword('wings-of-freedom!', stored)).toBe(false)
    expect(await verifyPassword('', stored)).toBe(false)
  })

  it('salts: same password twice gives different hashes, both valid', async () => {
    const a = await hashPassword('levi')
    const b = await hashPassword('levi')
    expect(a).not.toBe(b)
    expect(await verifyPassword('levi', a)).toBe(true)
    expect(await verifyPassword('levi', b)).toBe(true)
  })

  it('rejects malformed stored hashes instead of throwing', async () => {
    expect(await verifyPassword('x', 'not-a-hash')).toBe(false)
    expect(await verifyPassword('x', 'pbkdf2$oops')).toBe(false)
  })

  it('session tokens are unique, url-safe and long', () => {
    const a = newSessionToken()
    const b = newSessionToken()
    expect(a).not.toBe(b)
    expect(a.length).toBeGreaterThanOrEqual(40)
    expect(/^[A-Za-z0-9_-]+$/.test(a)).toBe(true)
  })

  it('sha256Hex matches a known vector', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  it('username rule: 3-16 word chars', () => {
    expect(USERNAME_RE.test('levi')).toBe(true)
    expect(USERNAME_RE.test('erwin_smith-1')).toBe(true)
    expect(USERNAME_RE.test('ab')).toBe(false)
    expect(USERNAME_RE.test('a'.repeat(17))).toBe(false)
    expect(USERNAME_RE.test('bad name')).toBe(false)
    expect(USERNAME_RE.test('tørn')).toBe(false)
  })
})
