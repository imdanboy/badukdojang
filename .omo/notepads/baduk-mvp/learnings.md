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

## 2026-07-05T13:05:00Z - T2: Interactive Goban Rendering

### Critical Import Gotcha
- `@sabaki/go-board` uses `module.exports = GoBoard` (CommonJS default export). Must use `import GoBoard from '@sabaki/go-board'` (default import), NOT `import { Board } from '@sabaki/go-board'` (named import). Named import returns `undefined`, causing `Cannot read properties of undefined (reading 'fromDimensions')` at runtime. TSC does NOT catch this because the `.d.ts` declares `export default GoBoard` — the mismatch is between the runtime CJS module and the ESM type declarations. Vite's CJS-to-ESM interop resolves the default export correctly.
- `@sabaki/shudan` exports `Goban` as a named export: `import { Goban } from '@sabaki/shudan'`. This works fine.

### Shudan API Details
- `signMap` and `markerMap` are both indexed `[y][x]` (rows of columns), confirmed by reading `Goban.js` source: `signMap?.[y]?.[x]` and `markerMap?.[y]?.[x]`.
- `markerMap` type is `Map<Marker | null>` = `(Marker | null)[][]`. To place a point marker at vertex `[x, y]`: set `markerMap[y][x] = { type: 'point' }`.
- `vertexSize` must be a number (pixels). Shudan uses it as `fontSize` for the CSS grid template. CSS-based sizing does NOT work — Shudan calculates internal layout from this number.
- `fuzzyStonePlacement` and `animateStonePlacement` must both be `true` for stone placement animation to work. Animation is handled in `componentDidUpdate` and only triggers when `fuzzyStonePlacement` is also enabled.
- `showCoordinates` adds coordinate labels on all four edges (A-S skipping I, 1-19).
- Shudan CSS (`@sabaki/shudan/css/goban.css`) is CRITICAL — without it, the board renders as unstyled divs with no grid lines, star points, or wooden background.

### ResizeObserver Pattern
- Container ref + `ResizeObserver` → `setContainerWidth(entry.contentRect.width)` → `vertexSize = Math.floor(containerWidth / boardSize)`.
- Initial `containerWidth` is 0 until first ResizeObserver callback; fall back to `24` (Shudan's own default) to avoid a zero-size flash.
- `maxWidth: 600px` on the container caps the board size on large viewports.

### Board Size Switching
- `useEffect` with `[boardSize]` dependency recreates the board via `GoBoard.fromDimensions(boardSize, boardSize)` and clears `lastMove`.
- The `<select>` uses `value={String(boardSize)}` and `onChange` parses the number back. Preact's `onChange` fires on `<select>` change correctly.

### Verification Results
- `bunx tsc --noEmit` exits 0 (zero type errors).
- `bun run dev` serves HTML at `http://localhost:5173` with `<div id="app">`.
- Playwright screenshots confirm: 19x19, 13x13, and 9x9 boards all render with grid lines, star points (hoshi), and coordinate labels (A-S/1-19, A-N/1-13, A-J/1-9, all skipping I per Go convention).
- Click on 13x13 center intersection logs `[6, 6]` to console.
- Goban bounding box (744x744 at x:268,y:96) is fully contained within app root (1280x856).
- Evidence: `.omo/evidence/task-2-baduk-mvp-19x19.png`, `task-2-baduk-mvp-13x13.png`, `task-2-baduk-mvp-9x9.png`, `task-2-baduk-mvp-edgeclick.txt`.

### T2 File Manifest
- `src/components/Board.tsx` — Preact component wrapping Shudan `<Goban>` with ResizeObserver-based `vertexSize` calculation
- `src/App.tsx` — Board size state (9|13|19), `<select>` dropdown, go-board instance management, `lastMove` tracking, `markerMap` construction
- `src/main.tsx` — Added `import '@sabaki/shudan/css/goban.css'` (critical for board rendering)
- `scripts/screenshot-t2.ts` — Playwright screenshot helper for T2 visual evidence
