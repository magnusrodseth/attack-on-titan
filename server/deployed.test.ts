import { expect, test } from 'vitest'
import { CONTENT_HASH } from '../src/sim/content'

/**
 * The deploy contract, asserted against the real thing.
 *
 * The client ships itself (Vercel, on push); the Worker did not, and on 2026-07-14 that gap ate
 * multiplayer: a revert removed the Evacuation mode, Vercel published a client that had never
 * heard of it, and the Worker sat an hour behind still holding the civilians. Every lobby was
 * refused with 4009 and nothing said so until a player tried to muster. The refusal was correct.
 * The silence before it was the bug.
 *
 * So the wire itself is the test. This does not check that someone *ran* a deploy — it checks
 * that the world now answering on the network is the world in this working tree, which is the
 * claim that actually matters and the only one a green pipeline should be allowed to make.
 *
 * Network-guarded: it needs a host to talk to, so `pnpm test` skips it and CI runs it with
 * DEPLOYED_HOST set, right after the deploy step.
 */
// `process` is reached through globalThis on purpose: this directory is typed with
// @cloudflare/workers-types and nothing else, because the Worker genuinely has no node globals at
// runtime. Pulling in @types/node to spare this one line would let real Worker code reference a
// `process` that does not exist in production. The test runs under vitest on node; the Worker does not.
const nodeEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {}
const host = nodeEnv.DEPLOYED_HOST
const whenDeployed = host ? test : test.skip

whenDeployed('the deployed Worker is running this exact world', async () => {
  const res = await fetch(`https://${host}/api/health`)
  expect(res.ok, `GET https://${host}/api/health -> ${res.status}`).toBe(true)

  const body = (await res.json()) as { ok?: boolean; content?: string }
  expect(body.ok).toBe(true)
  // the assertion the whole thing exists for: same hash, same world. If this fails, the Worker
  // and the client know different games and co-op is refused — redeploy (`pnpm server:deploy`).
  expect(
    body.content,
    `deployed Worker holds content "${body.content}", this tree is "${CONTENT_HASH}" — the Worker is skewed and every lobby will be refused with 4009`,
  ).toBe(CONTENT_HASH)
})
