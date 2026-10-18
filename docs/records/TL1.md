# TL1 · Dev tooling: browser MCP servers, property tests and knip (owner, 2026-10-18)

**Review:** 1 attempt · 8/8 · Accept (Sonnet)

## Attempts

| Date | Attempt | Worker model | build | tests | smoke | perf | scope | changelog | Critic | Retry reason | Wall time | Worker tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-18 | 1 | Opus 5.5 (build thread) | ✓ 18 s | ✓ 503 s | ✓ 1184 s | – not required | ✓ | ✗ (line written after the run; CHANGELOG-only commit, CI re-checks) | 8/8 Accept (Sonnet) | – | ~1 h 45 min | QA 37k, performance 18k, critic 31k + 29k, changelog 21k |

## Decisions

- **Versions pinned, servers started by `tools/mcp-browser.mjs`.** One `.mcp.json` entry then works on the owner's PC (visible throwaway Chrome profile) and in a cloud session (container Chromium, headless, no sandbox), and `node` avoids Windows' `cmd /c npx` wrapper.
- **No usage statistics, no CrUX lookups, isolated profiles.** Nothing about the game or the owner's browsing leaves the machine through these tools.
- **Smoke use, in this cloud session.** Playwright MCP opened the game's dev server, read the title and menu buttons and the console (0 errors). Chrome DevTools MCP opened it, ran a script, listed the console and recorded a performance trace. Both through the launcher.
- **Property tests seeded (20261018) and kept in the `fast` project.** About 3 s for 9 properties; QA's mutations of spin decay, flight-time estimate, winBy, half-time, time-out winner, draw scoring, route symmetry and the distance field were each caught. The airspeed bound is loose on purpose: exact flight stays pinned by `ballistics.test.ts`.
- **No property found a bug.** Nothing to add to KNOWN_ISSUES.
- **knip is a tool, not a gate.** Findings at the shared `audit/knip-2026-10-18.md`: the repository is clean, the shipped game has no dead files, 79 exports could lose `export`, 3 unlisted dependencies in the Blender figure tools. Nothing removed; removals wait for the owner.

## Known issues left

- None.
