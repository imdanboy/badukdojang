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

## 2026-07-05T13:10:00Z - T3: Game Rules Integration

### GameState Module
- Created `src/lib/gameState.ts` wrapping `@sabaki/go-board` with turn management and rule enforcement.
- `createGameState(size)` returns `{ board, currentPlayer, lastMove, makeMove, pass, getSignMap }`.
- `makeMove` uses `board.makeMove(sign, vertex, { preventOverwrite: true, preventSuicide: true, preventKo: true })` — parameter order is `(sign, vertex)` NOT `(vertex, sign)`.
- `makeMove` THROWS on illegal moves (not returns null), so it MUST be wrapped in try/catch.
- On success: reassign `board = newBoard`, flip `currentPlayer` (1 ↔ -1), update `lastMove`, return `true`.
- On failure: return `false` — UI layer (Board.tsx) flashes red border for 200ms.
- `pass()` flips `currentPlayer` without placing a stone.
- `getSignMap()` returns `board.signMap` typed as `SignMap` (not `number[][]`) to satisfy Shudan's strict `Map<0 | 1 | -1>` type.

### UI Integration
- App.tsx replaced direct go-board management with `createGameState`.
- `signMap` state is now driven by `gameState.getSignMap()` after each successful move.
- `markerMap` is built from `gameState.lastMove` instead of a separate `lastMove` state.
- Board.tsx receives `flashTrigger` prop — increments on illegal move, triggers `flashError` state for 200ms red border via `useEffect` + `setTimeout`.
- Pass button added below the board.

### TypeScript Strictness
- `exactOptionalPropertyTypes` is enabled — optional props must use `| undefined` explicitly, not just `?`.
- `noUncheckedIndexedAccess` is enabled — array access like `signMap[y][x]` requires non-null assertion `signMap[y]![x]` in tests.
- `SignMap` type from `@sabaki/go-board` is `(0 | 1 | -1)[][]`, which satisfies Shudan's `Map<0 | 1 | -1>`.

### Test Results
- `bun run test`: 7/7 passed.
- `bunx tsc --noEmit -p tsconfig.app.json`: 0 errors.
- Capture test: corner setup (B at 1,0; W at 0,0; B at 0,1) captures white stone at (0,0).
- Ko test: cross-capture setup prevents immediate recapture.
- Suicide test: corner setup with white surrounded by black rejects suicide at (0,0).
- Occupied test: clicking existing stone returns false, board unchanged.

### T3 File Manifest
- `src/lib/gameState.ts` — Game state wrapper with turn management, captures, ko, suicide, pass
- `src/lib/gameState.test.ts` — Unit tests for capture, ko, suicide, occupied, pass
- `src/App.tsx` — Wired to gameState, pass button, flashTrigger for illegal moves
- `src/components/Board.tsx` — Red border flash on illegal move via flashTrigger prop
- `.omo/evidence/task-3-baduk-mvp.png` — Screenshot showing stones placed and Pass button
- `.omo/evidence/task-3-baduk-mvp-capture-test.txt` — capture test evidence
- `.omo/evidence/task-3-baduk-mvp-ko-test.txt` — ko test evidence
- `.omo/evidence/task-3-baduk-mvp-suicide-test.txt` — suicide test evidence
- `.omo/evidence/task-3-baduk-mvp-occupied-test.txt` — occupied test evidence

## 2026-07-05T13:15:00Z - T4: Game Tree & History Navigation

### Immutable GameTree Integration
- `@sabaki/immutable-gametree` uses **CommonJS default export** (`module.exports = GameTree`), NOT named export. Runtime fails with `SyntaxError: Export named 'GameTree' not found` if you try `import { GameTree } from '@sabaki/immutable-gametree'`. Must use `import GameTree from '@sabaki/immutable-gametree'`.
- Created `src/types/immutable-gametree.d.ts` to provide TypeScript declarations for the CJS-only package. Declares both `export class GameTree` and `export default GameTree` so TypeScript accepts both import styles.
- `tree.mutate(mutator)` returns a **new** GameTree instance. If the mutator makes no changes, it returns `this` (same instance). This means you cannot use `mutate` to create a clone for undo/redo — need `JSON.parse(JSON.stringify(tree.root))` or similar.
- `tree.navigate(id, step, currents)` returns the node at the new position. `step=-1` goes to parent, `step=1` goes to first child. Returns `null` if no such node.
- `tree.listNodesVertically(startId, -1, {})` walks UP from startId to root. `.reverse()` gives root-to-current path for replay.
- There is **NO** `getCurrent()` method. You must track the current node ID yourself. We store it as `tree.currentId` via module augmentation.

### GameTree Module Design
- `createGameTree(size)` creates a tree with a root node `{ id: 'root', data: {}, parentId: null, children: [] }`.
- `appendMove(tree, vertex, sign)` appends a child node with SGF property `B[xy]` or `W[xy]`. SGF coords: lowercase letters, `'a'=0`.
- `appendPass(tree, sign)` appends a child node with empty property `B[]` or `W[]`.
- `undo(tree)` / `redo(tree)` clone the tree (to preserve immutability of the original reference) and update `currentId` on the clone.
- `getCurrentSignMap(tree, size)` replays all moves from root to current node through `go-board` to derive the board state. Uses `preventSuicide: false, preventKo: false` because moves were already validated when played.
- `getMoveList(tree)` returns the sequence of moves from root to current, with `'pass'` for pass moves.

### GameState Integration
- Added `gameTree: GameTree` to GameState interface.
- `makeMove` appends to the tree on success.
- `pass` appends a pass node to the tree.
- `undo()` / `redo()` update the tree, then call `syncFromTree()` to reconstruct the board from the tree's move list.
- `deriveCurrentPlayer()` and `deriveLastMove()` compute state from the tree's move list instead of tracking separately. This ensures consistency after undo/redo.
- `lastMove` after a pass: remains the last placed stone (not null), because passes don't have a vertex.

### UI Integration
- App.tsx added `handleUndo` and `handleRedo` functions that call `gameState.undo()` / `gameState.redo()` and update `signMap` state.
- Undo/Redo/Pass buttons arranged in a horizontal flex row below the board.
- Board size change still recreates the game state (and thus the tree) from scratch.

### TypeScript Strictness
- `exactOptionalPropertyTypes`: optional props must use `| undefined` explicitly.
- `noUncheckedIndexedAccess`: array access requires non-null assertion `arr[i]!`.
- Module augmentation for `GameTree.currentId` works via `declare module '@sabaki/immutable-gametree' { interface GameTree { currentId?: ... } }`.

### Test Results
- `bun run test`: 26/26 passed (14 gameTree + 12 gameState).
- `bunx tsc --noEmit -p tsconfig.app.json`: 0 errors.
- QA scenarios verified: undo restores state, redo restores state, undo at root is no-op, undo + new move creates branch, captures replay correctly after undo/redo.

### T4 File Manifest
- `src/lib/gameTree.ts` — Immutable game tree wrapper with SGF-style move storage, undo/redo, board replay, move list
- `src/lib/gameTree.test.ts` — 14 tests covering create, appendMove, appendPass, undo, redo, getCurrentSignMap, getMoveList, branching
- `src/lib/gameState.ts` — Integrated gameTree with undo/redo, syncFromTree, deriveCurrentPlayer, deriveLastMove
- `src/lib/gameState.test.ts` — 12 tests including 5 new undo/redo/capture tests
- `src/App.tsx` — Undo/Redo buttons wired to gameState
- `src/types/immutable-gametree.d.ts` — TypeScript declarations for CJS-only package
- `.omo/evidence/task-4-baduk-mvp-undo-test.txt` — undo QA evidence
- `.omo/evidence/task-4-baduk-mvp-redo-test.txt` — redo QA evidence
- `.omo/evidence/task-4-baduk-mvp-undo-root-test.txt` — undo-at-root QA evidence

## 2026-07-05T13:20:00Z - T5: SGF Save & Load

### @sabaki/sgf Integration
- `@sabaki/sgf` has **no TypeScript declarations** — created `src/types/sgf.d.ts` to declare `stringify` and `parse`.
- `stringify([tree.root])` takes a `NodeObject[]` (array of root nodes), NOT a `GameTree`. It produces flat SGF text with `FF[4]`, `GM[1]`, `SZ[19]` headers.
- `parse(contents, { getId })` returns `NodeObject[]` (root nodes), NOT `GameTree[]`. Must wrap the first root node in `new GameTree({ getId, root: parsedNodes[0] })`.
- **Critical**: The `getId` function must be **shared** between `parse` and `new GameTree` to keep node ids consistent.
- **Critical**: Parsed trees need `currentId` set to the deepest leaf node, otherwise `getMoveList` and `getCurrentSignMap` return empty/incorrect results because they walk from `currentId` backwards.

### SGF Pass Representation
- `appendPass` stores pass as `B: []` or `W: []` in the tree.
- `stringify` serializes empty arrays as `B[]` or `W[]` (empty value inside brackets).
- `parse` deserializes `B[]` as `B: ['']` (array with one empty string), NOT `B: []`.
- **Had to fix `gameTree.ts`**: `getMoveList` and `getCurrentSignMap` must treat `prop[0] === ''` as a pass, not as a coordinate. Previously only checked `prop.length === 0`.

### Board Size Handling
- `treeToSGF` adds `SZ[size]` to the root node data before stringifying.
- `sgfToTree` extracts `SZ` from parsed root node data.
- `getBoardSizeFromTree(tree)` helper returns `Number(tree.root.data.SZ?.[0])` or defaults to 19.
- App.tsx: On load, if the loaded size differs from current, updates `boardSize` state (triggers `useEffect` to recreate game state) OR creates game state directly with the loaded tree.

### UI Integration
- **Save SGF**: `downloadSGF` creates a Blob with `type: 'application/x-go-sgf'`, uses `URL.createObjectURL`, triggers `<a download>` click, then `URL.revokeObjectURL`.
- **Load SGF**: Hidden `<input type="file" accept=".sgf,text/plain">` triggered by a "Load SGF" button. `FileReader` reads text, `sgfToTree` parses, `createGameState(size, loadedTree)` creates game state from tree.
- `createGameState` modified to accept optional `initialTree` parameter. When provided, calls `syncFromTree()`, `deriveLastMove()`, `deriveCurrentPlayer()` to initialize state from the tree.

### Test Results
- `bun run test`: 38/38 passed (14 gameTree + 12 gameState + 12 sgfIo).
- `bunx tsc --noEmit -p tsconfig.app.json`: 0 errors.
- QA scenarios verified: round-trip preserves moves and board state, captures replay correctly after round-trip, malformed SGF with out-of-range coords parses without crash, non-SGF content throws "SGF contains no game data".

### T5 File Manifest
- `src/lib/sgfIo.ts` — `treeToSGF`, `sgfToTree`, `downloadSGF`, `loadSGFFile`, `getBoardSizeFromTree`
- `src/lib/sgfIo.test.ts` — 12 tests covering round-trip, captures, malformed, non-SGF, board size extraction, file load, download
- `src/types/sgf.d.ts` — TypeScript declarations for `@sabaki/sgf`
- `src/lib/gameTree.ts` — Fixed pass detection for `B: ['']` / `W: ['']` from parsed SGF
- `src/lib/gameState.ts` — Added optional `initialTree` parameter to `createGameState`
- `src/App.tsx` — Save SGF button, Load SGF button + hidden file input, file load handler with board size extraction
- `.omo/evidence/task-5-baduk-mvp-sgf-roundtrip.sgf` — sample SGF file from round-trip test
- `.omo/evidence/task-5-baduk-mvp-sgf-roundtrip-test.txt` — round-trip test output
- `.omo/evidence/task-5-baduk-mvp-sgf-malformed-test.txt` — malformed SGF test output
- `.omo/evidence/task-5-baduk-mvp-sgf-nonsgf-test.txt` — non-SGF rejection test output

## 2026-07-05T13:30:00Z - T6: Control Bar Integration

### ControlBar Component Design
- Created `src/components/ControlBar.tsx` as a separate presentational component receiving all state and callbacks as props from App.tsx.
- 10 control elements: Turn indicator (colored circle + text), Move counter, Board Size select, New Game, Pass, Undo, Redo, Save SGF, Load SGF, Coordinates toggle.
- Dark background `#1a1a2e` with `#3b3b5c` button background and `#e0e0e0` text — makes the wood board pop visually.
- Flexbox row with `gap: 12px`, `flexWrap: 'wrap'` for responsive behavior on narrow viewports.
- Vertical divider lines (`1px x 24px`, `#3b3b5c`) separate logical groups: turn/move info | board size | action buttons | coordinates toggle.

### Disabled State Logic
- Undo disabled when `gameTree.currentId === gameTree.root.id` (at root, no parent to navigate to).
- Redo disabled when current node has no children: `tree.get(currentId)?.children.length === 0` (at leaf).
- Disabled style: `opacity: 0.5`, `cursor: 'not-allowed'` — applied via shared `btnStyle(disabled)` helper.
- Playwright confirmed: `page.locator('button:has-text("Undo")').isDisabled()` returns `true` at game start.

### Board Size Select Migration
- Moved `<select>` from App.tsx into ControlBar. App.tsx passes `boardSize` and `onBoardSizeChange` (which is just `setBoardSize`).
- Changing board size mid-game triggers the `useEffect([boardSize])` in App.tsx which recreates game state from scratch — no confirmation dialog needed per spec.
- `BoardSize` type (`9 | 13 | 19`) is now exported from ControlBar.tsx and imported by App.tsx.

### ShowCoordinates Prop
- Board.tsx previously had `showCoordinates={true}` hardcoded. Added `showCoordinates?: boolean` prop (default `true`) and passed it through to Shudan's `<Goban>`.
- App.tsx holds `showCoordinates` state, passes it to both ControlBar (for the checkbox) and Board (for the Goban prop).
- Toggling the checkbox immediately shows/hides coordinate labels on the board — no re-render delay.

### Move Counter & Turn Indicator
- Move counter: `getMoveList(gameState.gameTree).length` — returns the number of moves from root to current node. Pass moves count as moves too.
- Turn indicator: `gameState.currentPlayer === 1 ? 'Black' : 'White'` with a colored circle (`#1a1a1a` for black, `#f0f0f0` for white, both with `1px solid #555` border for visibility on dark background).

### File Input Management
- File input `<input type="file">` lives inside ControlBar with its own `useRef`. The `onFileChange` callback is passed from App.tsx (handles SGF parsing, board size extraction, game state recreation).
- This keeps the file input DOM node co-located with its trigger button while the business logic stays in App.tsx.

### Preact Ref Typing
- `useRef<HTMLInputElement>` in Preact returns `RefObject<HTMLInputElement>` but the type needs casting when passed to `ref={}` on a DOM element due to Preact's JSX types. Used `fileInputRef as RefObject<HTMLInputElement>` cast.
- Import `RefObject` from `preact` (not `preact/hooks`).

### Verification Results
- `bunx tsc --noEmit -p tsconfig.app.json`: 0 errors.
- Playwright QA: All 10 control elements present (count=1 each). Undo disabled at root=true. After 3 moves → "Move 3". After Undo → "Move 2". After Redo → "Move 3". After New Game → "Move 0". Coordinates toggle hides/shows labels.
- Evidence: `task-6-baduk-mvp-controls.png`, `task-6-baduk-mvp-undo-redo.png`, `task-6-baduk-mvp-newgame.png`, `task-6-baduk-mvp-no-coords.png`, `task-6-baduk-mvp-undo-disabled.txt`.

### T6 File Manifest
- `src/components/ControlBar.tsx` — New component with all 10 control elements
- `src/components/Board.tsx` — Added `showCoordinates` prop (was hardcoded `true`)
- `src/App.tsx` — Integrated ControlBar, added `showCoordinates` state, `handleNewGame` handler, removed inline buttons/select
- `scripts/screenshot-t6.ts` — Playwright screenshot helper for T6 visual evidence

## 2026-07-05T13:25:00Z - T7: Comprehensive Vitest Test Suite

### Test Suite Structure
- Created `src/lib/__tests__/gameState.test.ts` with 22 comprehensive tests covering all required scenarios.
- Existing tests remain in `src/lib/gameState.test.ts` (12 tests), `src/lib/gameTree.test.ts` (14 tests), `src/lib/sgfIo.test.ts` (12 tests).
- Total: 60 tests across 4 test files, all passing.

### Required Test Cases Covered
(a) place stone on empty intersection → appears on board  
(b) place on occupied → rejected  
(c) place on another stone's liberty → no capture  
(d) fill all liberties of a group → group captured  
(e) multi-stone group capture  
(f) simple ko: setup cross-capture → immediate recapture rejected  
(g) suicide move rejected  
(h) pass flips turn without placing  
(i) board size 9/13/19 initializes correctly  
(j) undo restores previous state  
(k) redo after undo restores  
(l) undo at root is no-op  
(m) SGF round-trip: play moves → save → load → board matches  
(n) SGF parse malformed input → handles gracefully  

### Configuration Changes
- `vitest.config.ts`: Added `setupFiles: ['./src/test-setup.ts']` to load `@testing-library/preact` before each test.
- `src/test-setup.ts`: Created with `import '@testing-library/preact'`.
- `package.json`: Changed `"test": "vitest"` (watch mode) and added `"test:run": "vitest run"` (CI single run).

### Coverage Results
- gameState.ts: 96.07% statements, 93.75% branch, 92.3% funcs, 97.91% lines
- gameTree.ts: 98.63% statements, 83.58% branch, 100% funcs, 98.59% lines
- sgfIo.ts: 93.02% statements, 87.5% branch, 88.88% funcs, 95.12% lines
- All three modules exceed the ≥80% threshold.

### QA Scenarios Verified
- `bun run test:run`: 60/60 passed, exit 0. Evidence: `.omo/evidence/task-7-baduk-mvp-test-output.txt`
- Intentional failure: modified assertion to `.toBe(99)`, `bun run test:run` exited 1 with `FAIL` in output. Evidence: `.omo/evidence/task-7-baduk-mvp-test-failure.txt`
- Coverage: `bunx vitest run --coverage` shows all modules ≥80%. Evidence: `.omo/evidence/task-7-baduk-mvp-coverage.txt`

### Coordinate Gotcha in Tests
- `signMap` is indexed `[y][x]`, not `[x][y]`. A stone placed at vertex `[4,5]` (x=4, y=5) must be checked with `signMap[5][4]`. Two initial test assertions failed because of this coordinate swap. The existing T3 tests already use the correct indexing pattern (`signMap[0]![0]`), but multi-stone capture tests require careful mental mapping.

### T7 File Manifest
- `src/lib/__tests__/gameState.test.ts` — 22 comprehensive tests for gameState, gameTree, and sgfIo
- `src/test-setup.ts` — `@testing-library/preact` import for jsdom setup
- `vitest.config.ts` — Added `setupFiles` entry
- `package.json` — `test` script switched to watch mode, `test:run` added for CI
