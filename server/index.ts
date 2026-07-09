import { Hono } from 'hono'
import { routePartykitRequest } from 'partyserver'
import { api } from './api'
import type { Env } from './env'

export { MatchRoom } from './room'

const app = new Hono<{ Bindings: Env }>()

app.route('/api', api)

// partyserver owns /parties/:party/:room (websocket upgrade and Durable Object routing)
app.all('/parties/*', async (c) => {
  const response = await routePartykitRequest(c.req.raw, c.env as unknown as Record<string, unknown>)
  return response ?? c.json({ error: 'Not found' }, 404)
})

app.notFound((c) => c.json({ error: 'Not found' }, 404))

app.onError((err, c) => {
  console.error('unhandled error', err instanceof Error ? err.message : err)
  return c.json({ error: 'Internal error' }, 500)
})

export default { fetch: app.fetch }
