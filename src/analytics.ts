import posthog from 'posthog-js'

// PostHog project "attack-on-titan" (EU cloud, org "Attack On Titan"). The token is a
// public client-side key, safe to ship in the bundle.
const POSTHOG_TOKEN = 'phc_DgHJjzGtffqRiGEhDkb2JvfQHHC5RnmhLqsvuXhwzCgq'

// Real visitor traffic only: production builds, or a dev session explicitly opted in
// with ?analytics=1 (used to verify the integration end to end without deploying).
const enabled =
  import.meta.env.PROD || new URLSearchParams(location.search).get('analytics') === '1'

export function initAnalytics(): void {
  if (!enabled) return
  posthog.init(POSTHOG_TOKEN, {
    api_host: 'https://eu.i.posthog.com',
    defaults: '2026-05-30',
    // gameplay is a stream of canvas clicks; autocapture and its rage/dead-click
    // heuristics would read every fight as frustration, so only explicit events go out
    autocapture: false,
    rageclick: false,
    capture_dead_clicks: false,
  })
}

/** Fire-and-forget usage event; a no-op outside production. */
export function track(event: string, props?: Record<string, unknown>): void {
  if (!enabled) return
  posthog.capture(event, props)
}
