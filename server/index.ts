import { routePartykitRequest } from 'partyserver'
import { handleApi } from './api'
import type { Env } from './env'

export { MatchRoom } from './room'

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname.startsWith('/api/')) return handleApi(request, env)
    return (
      (await routePartykitRequest(request, env as unknown as Record<string, unknown>)) ??
      new Response('Not found', { status: 404 })
    )
  },
}
