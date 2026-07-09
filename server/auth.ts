/**
 * Password hashing and session tokens on WebCrypto only — no dependencies, runs in
 * Workers and Node (vitest) alike. Threat model: friends-scale game accounts with no
 * email attached; PBKDF2-SHA256 at 100k iterations is a sane, native-speed fit.
 */

const ITERATIONS = 100_000

export const USERNAME_RE = /^[A-Za-z0-9_-]{3,16}$/
export const MIN_PASSWORD_LENGTH = 6
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

function toB64(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}

function fromB64(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
    'deriveBits',
  ])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    key,
    256,
  )
  return new Uint8Array(bits)
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await pbkdf2(password, salt, ITERATIONS)
  return `pbkdf2$${ITERATIONS}$${toB64(salt)}$${toB64(hash)}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iterStr, saltB64, hashB64] = stored.split('$')
  if (scheme !== 'pbkdf2' || !iterStr || !saltB64 || !hashB64) return false
  const expected = fromB64(hashB64)
  const actual = await pbkdf2(password, fromB64(saltB64), Number(iterStr))
  if (actual.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < actual.length; i++) diff |= actual[i]! ^ expected[i]!
  return diff === 0
}

/** Opaque bearer token handed to the client; only its hash is stored. */
export function newSessionToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return toB64(bytes).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
