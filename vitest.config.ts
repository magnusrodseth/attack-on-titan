import { configDefaults, defineConfig } from 'vitest/config'

/**
 * The only reason this file exists: keep vitest inside *this* commit.
 *
 * Agent worktrees live under `.claude/worktrees/`, and a worktree is a full checkout — including
 * every `*.test.ts` in it, at whatever commit that branch is parked on. Vitest's default include
 * globs sweep the whole tree, so a local `pnpm test` was collecting the suite twice: 35 files from
 * the working tree and 34 more from a worktree pinned to an old commit. It reported 1163 passing
 * tests where the repo has 583, and roughly half the green came from code that is not this code.
 *
 * That is worse than a slow test run. A stale worktree can go green on logic HEAD has since
 * changed, or red on logic HEAD has since fixed, and either way the number at the bottom of the
 * run stops describing the commit you are about to push. CI (a clean checkout, no worktrees) never
 * saw them, so the two disagreed — and the honest one was the one nobody was reading.
 */
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, '**/.claude/worktrees/**'],
  },
})
