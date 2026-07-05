# baduk-mvp Learnings

## 2026-07-05T03:53:29Z - Session Start
- Plan: baduk-mvp.md
- Boulder: baduk-mvp-193d7a36
- Session: opencode:ses_0cf9718dcffeWqyQbQTpiYuW5w
- Strategy: Sequential waves per dependency matrix. T1 blocks all, then T2, T3, T4, T5, then T6+T7 parallel, then T8, then F1-F4 parallel.

## Key Decisions
- Use Bun + Vite + Preact + TypeScript
- Use @sabaki/* libraries (shudan, go-board, immutable-gametree, sgf)
- No AI, no desktop wrapper, no scoring, no superko
- Strict TypeScript mode
- Conventional commits for every todo

## Conventions
- Board sizes: 9, 13, 19
- Sign convention: 1=black, -1=white, 0=empty
- SGF coords: lowercase letters, 'a'=0
- go-board API: Board.fromDimensions(w, h) NOT new Board(w, h)
- makeMove parameter order: (sign, vertex) NOT (vertex, sign)
- Shudan requires CSS import for proper rendering
- Shudan markerMap for last-move marker (no showLastMoveMarker prop)
- animateStonePlacement ONLY works with fuzzyStonePlacement=true

## Gotchas
- go-board makeMove THROWS on illegal moves (not returns null)
- stringify takes NodeObject[] not GameTree
- parse returns NodeObject[] not GameTree[]
- Shudan vertexSize must be calculated from container width

## 2026-07-05T12:56:00Z - T1: Project Scaffold
- Vite preact-ts template now ships with **TypeScript 6.0.x** and **Vite 8.x** (current latest). `bun add` resolves cleanly.
- `bunx create-vite . --template preact-ts` cancels on non-empty dir (TTY prompt). Workaround: scaffold to a temp dir then `cp` the non-conflicting files (`package.json`, `tsconfig*.json`, `vite.config.ts`, `index.html`, `public/`, `src/main.tsx`, `src/index.css`); write `src/App.tsx` by hand.
- Default template uses **dual tsconfig** setup: `tsconfig.json` (project references) → `tsconfig.app.json` (src) + `tsconfig.node.json` (build config). All strict mode flags live in `tsconfig.app.json`.
- Vitest 4.x: by default exits 1 when no test files exist. Add `--passWithNoTests` flag to the `test` script (CI-friendly behavior).
- `bunx tsc --noEmit` works against the root `tsconfig.json` which references both subprojects — no `-p` flag needed for a quick check.
- Bun's `bun add -d` adds the package AND writes the `^x.y.z` semver to `package.json` exactly as requested.
- React/Preact alias mapping in tsconfig (`"react": ["./node_modules/preact/compat/"]`) lets future T2+ libraries that import `react` work transparently.
- `bunx playwright install chromium` downloads ~93MB; safe to run once and cache.
- One-off screenshot helper at `scripts/screenshot.ts` is reusable for T2-T8 visual evidence.
- Verified end-to-end on T1: `bun install` 0 errors, `bun run dev` serves `http://localhost:5173` with `<div id="app">`, `bun run build` succeeds, `bun run test` exits 0 with 0 tests, `bunx tsc --noEmit` exits 0.
- Visual evidence: `.omo/evidence/task-1-baduk-mvp.png` (1280x800 PNG of blank T1 shell). TSC evidence: `.omo/evidence/task-1-baduk-mvp-tsc.txt` (empty = no errors).

### T1 file manifest
- `package.json` — name `badukdojang`, scripts: `dev`, `build`, `preview`, `test`, `test:watch`, `typecheck`
- `tsconfig.app.json` — full strict mode (strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes, noImplicitOverride, etc.)
- `vitest.config.ts` — `environment: 'jsdom'`, includes `src/**/*.{test,spec}.{ts,tsx}`, Preact plugin
- `.gitignore` — adds `.omo/evidence/`, `coverage/`, `playwright-report/`, `test-results/`
- `src/App.tsx` — minimal shell with full-viewport flexbox-centered `<div id="app-root">` + a single placeholder `<p>`
- `src/main.tsx` — `render(<App />, root)` with explicit null-check on `#app` root element

### T1 known limitations (not blockers for T2)
- No test files exist yet; T1 verification just confirms Vitest runs cleanly. T2 will add `src/lib/board.test.ts`.
- No `@sabaki/*` imports yet; only installed. T2 wires Shudan into the container.
- Vitest config has no `setupFiles`; T2+ may need `@testing-library/preact` cleanup hook.
