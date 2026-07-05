# baduk-mvp - Work Plan

## TL;DR (For humans)

**What you'll get:** 바로 클릭해서 바둑을 둘 수 있는 웹 바둑판입니다. 착점, 포획(잡기), 패 규칙이 자동으로 적용되고, 무르기/다시하기로 수를 되돌릴 수 있으며, SGF 파일로 저장하고 불러올 수 있습니다. 9x9, 13x13, 19x19 크기를 선택할 수 있습니다.

**Why this approach:** Sabaki(2,700+ 스타, 가장 인기 있는 오픈소스 바둑 프로그램)가 실사용하는 라이브러리(`@sabaki/shudan`, `@sabaki/go-board`, `@sabaki/sgf`, `@sabaki/immutable-gametree`)를 그대로 가져다 써서, 바둑판 그리기와 규칙 엔진을 직접 만드는 몇 주의 작업을 5개 npm 패키지 설치로 단축합니다. 인공지능 대국과 데스크탑 패키징은 두 번째 phase로 연기하여, 가장 빠르게 돌아가는 바둑판을 먼저 만듭니다.

**What it will NOT do:**
- 인공지능 대국(KataGo)은 안 됩니다 — phase 2에서 데스크탑 래핑 후 추가
- 데스크탑 앱(.dmg/.exe)으로 패키징하지 않습니다 — 웹 브라우저에서 실행
- 온라인 대국, 시간 제한(초읽기), 핸디캡, 영역 집계(계가), 게임 종료 판정은 없습니다

**Effort:** Short (주말 2-3일)
**Risk:** Low — 모든 라이브러리가 MIT 라이선스로 실전 검증됨
**Decisions I made for you:**
- TypeScript + Preact (Shudan이 Preact 네이티브, 3KB 경량)
- Bun + Vite (가장 빠른 개발 환경)
- 영역 계가/집계 기능 없음 (착점과 포획만 추적, 득점 계산은 phase 2)
- 단순 패 규칙만 (초K/포지션 초코는 phase 2)
- 데스크탑 래핑은 Tauri 2 추천 (10MB, macOS WKWebView) phase 2에서 웹앱을 그대로 래핑
- KataGo는 phase 2에서 `@sabaki/gtp` + `brew install katago`로 연동

이 디폴트 중 변경하고 싶은 것이 있으면 말씀해 주세요.

Your next move: `/start-work`로 실행을 시작, 또는 변경 요청. Full execution detail follows below.

---

> TL;DR (machine): Short effort, Low risk — working self-play Go board (9/13/19) with captures, ko, undo/redo, SGF I/O using @sabaki/* libraries in TypeScript + Vite + Preact + Bun.

## Scope
### Must have
- Vite + Preact + TypeScript project scaffolded with Bun, running at `localhost:5173`
- Interactive Go board rendered with `@sabaki/shudan` (selectable 9x9 / 13x13 / 19x19)
- Stone placement by clicking (alternating black/white automatically)
- Capture rule: groups with no liberties are automatically removed
- Simple ko rule: cannot recapture a single stone in the immediately resulting position
- Pass move button
- Undo / redo navigation through the game tree
- SGF save: export current game as `.sgf` file download (FF[4] compliant)
- SGF load: import `.sgf` file to replay a game on the board
- Board coordinate labels toggle (A-T excluding I, 1-19)
- Star points (hoshi) rendered automatically by Shudan
- Last-move marker (red dot at the most recent stone)
- Responsive board sizing (fills container width)
- Unit tests (Vitest) for game logic (captures, ko, pass, board sizes, SGF round-trip)
- E2E tests (Playwright) for board interaction (click-to-place, undo, SGF round-trip)
- Conventional commits for every todo

### Must NOT have (guardrails, anti-slop, scope boundaries)
- NO AI engine integration (KataGo, GTP, Leela Zero) — phase 2
- NO desktop wrapper (Tauri / Electron / Wails) — phase 2, the same Vite app wraps later
- NO online multiplayer — not desired by user
- NO photo-to-resume feature — future vision, not MVP
- NO superko rule — simple ko only (go-board supports it but we don't enable it yet)
- NO scoring of any kind (area, territory, Japanese, Chinese) — scoring is phase 2. The board tracks moves and captures but does not compute a score
- NO dead-stone detection or scoring agreement phase
- NO game-end detection — two consecutive passes do not trigger any end-of-game state; the game continues indefinitely
- NO time controls (byo-yomi, Fischer, Canadian) — MVP is casual self-play
- NO handicap stones — phase 2
- NO game commentary / annotation marks (triangles, squares, labels) — phase 2
- NO multiple game tabs or windows — single game per session
- NO board themes / wood textures / stone styles beyond Shudan defaults — phase 2
- NO variation branching in the UI — linear move history only (the tree supports branching but UI shows trunk)
- NO move tree visual graph sidebar — phase 2

## Verification strategy
> Zero human intervention - all verification is agent-executed.
- Test decision: tests-after + TDD where rules logic is involved (captures, ko, SGF). Unit tests with Vitest, E2E with Playwright.
- Framework: Vitest (unit, `bun run test`), Playwright (E2E, `bun run e2e`)
- Evidence: `.omo/evidence/task-<N>-baduk-mvp.<ext>` — screenshots, test output, SGF file content
- Every todo includes both a happy path and a failure path test scenario.

## Execution strategy
### Parallel execution waves
> Target 5-8 todos per wave. Fewer than 3 (except the final) means under-splitting.

**Wave 1 — Foundation (T1, T2):** Project scaffolding and board rendering. T1 blocks everything. T2 depends on T1.
**Wave 2 — Game logic (T3):** Rules integration. T3 depends on T1+T2 (wires into Board.tsx).
**Wave 3 — Game tree (T4):** Move history. T4 depends on T1+T3 (modifies gameState.ts from T3).
**Wave 4 — I/O (T5):** SGF I/O. T5 depends on T4 (game tree needed for SGF serialization).
**Wave 5 — UI (T6):** Control bar. T6 depends on T2+T3+T4+T5 (wraps all into a UI, uses sgfIo from T5).
**Wave 6 — Testing (T7, T8):** Unit and E2E tests. T7 depends on T3+T4+T5 (tests all logic modules). T8 depends on T6 (tests full UI flow). T7 and T8 can run in parallel.
**Wave 5 — Final verification (F1-F4):** Runs after all todos.

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| T1 | — | T2, T3, T4, T5, T6, T7, T8 | — |
| T2 | T1 | T3, T6, T8 | — |
| T3 | T1, T2 | T4, T6, T7 | — |
| T4 | T1, T3 | T5, T6, T7 | — |
| T5 | T4 | T6, T7 | — |
| T6 | T2, T3, T4, T5 | T8 | T7 |
| T7 | T3, T4, T5 | — | T8 |
| T8 | T6 | — | T7 |

## Todos
> Implementation + Test = ONE todo. Never separate.
<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->

- [x] 1. Project scaffolding: Vite + Preact + TS + @sabaki/* dependencies
  What to do: Initialize a Vite Preact-TS project with Bun. Install `@sabaki/shudan`, `@sabaki/go-board`, `@sabaki/immutable-gametree`, `@sabaki/sgf` via `bun add`. Add Vitest and Playwright as dev deps. Create the basic `src/App.tsx` shell with a centered full-viewport container div. Configure `tsconfig.json` with strict mode. Add `.gitignore` for `node_modules/`, `dist/`, `.omo/evidence/`. Set up `bun run dev` (Vite dev server) and verify it boots to `localhost:5173` with a blank page.
  Must NOT do: Do NOT install `@sabaki/gtp` (phase 2). Do NOT set up Tauri/Electron/Wails. Do NOT create any game logic yet — just the shell. Do NOT skip strict TypeScript mode.
  Parallelization: Wave 1 | Blocked by: nothing | Blocks: T2, T3, T4, T5, T6, T7, T8
  References (executor has NO interview context):
    - Package versions (install exact versions): `@sabaki/shudan@^1.7.1`, `@sabaki/go-board@^1.4.1`, `@sabaki/immutable-gametree@^1.9.4`, `@sabaki/sgf@^3.4.7`
    - Shudan npm: https://www.npmjs.com/package/@sabaki/shudan
    - go-board npm: https://www.npmjs.com/package/@sabaki/go-board
    - Vite Preact-TS template: `bun create vite@latest . --template preact-ts` (or `bunx create-vite . --template preact-ts`)
    - Research finding: Sabaki uses these exact packages in production (github.com/SabakiHQ/Sabaki package.json)
    - Vitest: `bun add -d vitest @testing-library/preact jsdom @vitest/coverage-v8`
    - Playwright: `bun add -d @playwright/test` then `bunx playwright install chromium`
  Acceptance criteria (agent-executable): `bun install` succeeds (zero errors from direct deps; transitive warnings OK). `bun run dev` starts Vite and `curl -s http://localhost:5173 | grep -q "div id=\"app\""` succeeds. `bun run test` runs Vitest with 0 tests passing (no failures). `cat package.json | jq '.dependencies["@sabaki/shudan"]'` returns `"^1.7.1"`.
  QA scenarios:
    - Happy: Start dev server, confirm page loads. Playwright `page.goto('http://localhost:5173')` returns 200. Evidence: `.omo/evidence/task-1-baduk-mvp.png` (Playwright screenshot of blank page).
    - Failure: `bun run build` should succeed with no TS errors. Run `bunx tsc --noEmit` — must exit 0. Evidence: `.omo/evidence/task-1-baduk-mvp-tsc.txt`.
  Commit: Y | chore(init): scaffold vite preact-ts project with @sabaki/* deps

- [x] 2. Board rendering: interactive Go board with @sabaki/shudan
  What to do: Create `src/components/Board.tsx` — a Preact component that renders `@sabaki/shudan`'s `<Goban>` with a `signMap` prop. The `signMap` is a 2D array of `1` (black), `-1` (white), `0` (empty) generated from a `@sabaki/go-board` instance. Add a board-size state (`9 | 13 | 19`) with a `<select>` dropdown in `App.tsx`. Initialize an empty board on each size change using `Board.fromDimensions(width, height)` (NOT `new Board(width, height)` which takes a signMap, not dimensions). Wire Shudan's `onVertexClick` to console.log the clicked vertex for now (real placement is T3). Enable `showCoordinates` prop. Set `vertexSize` via a `ResizeObserver` on the container: calculate `vertexSize = Math.floor(containerWidth / boardSize)` and pass as a number prop (Shudan requires a fixed pixel number, not CSS-based sizing). Enable `fuzzyStonePlacement` and `animateStonePlacement` together (animation ONLY works when fuzzy is also enabled). For the last-move marker, use the `markerMap` prop with a `{ [x]: { [y]: { type: 'point' } } }` entry at the most recent stone position (there is NO `showLastMoveMarker` prop — it does not exist in Shudan).
  Must NOT do: Do NOT implement stone placement logic yet (T3). Do NOT implement undo/redo yet (T4). Do NOT create the control bar yet (T6). The click handler logs only. Do NOT use `showLastMoveMarker` prop — it does not exist.
  Parallelization: Wave 2 | Blocked by: T1 | Blocks: T3, T6, T8
  References:
    - Shudan API: `import { Goban } from '@sabaki/shudan'` — CRITICAL: also import CSS `import '@sabaki/shudan/css/goban.css'` (or include in `index.html` via `<link>`) — without this CSS the board will NOT render correctly (no grid lines, no stone styles, no board background). Available props (verified against README):
      - `signMap: number[][]` (1=black, -1=white, 0=empty)
      - `vertexSize: number` (fixed pixel size for each intersection — must calculate from container width, NOT auto)
      - `showCoordinates: boolean`
      - `fuzzyStonePlacement: boolean` (enables random stone offset)
      - `animateStonePlacement: boolean` (ONLY works if `fuzzyStonePlacement` is also `true`)
      - `markerMap: { [x: number]: { [y: number]: { type: 'point' | 'circle' | 'square' | 'triangle' | 'label' | 'cross' | 'label' } } }` — used for last-move marker (there is NO `showLastMoveMarker` prop)
      - `onVertexClick: (evt: MouseEvent, vertex: [number, number]) => void`
    - Shudan README: https://github.com/SabakiHQ/Shudan/blob/master/docs/README.md
    - Shudan example usage in Sabaki: https://github.com/SabakiHQ/Sabaki/blob/master/src/components/Goban.js
    - signMap convention: `1` = black, `-1` = white, `0` = empty (Shudan uses this, NOT 1/2/0)
    - go-board API: `import Board from '@sabaki/go-board'` — `Board.fromDimensions(width, height)` creates empty board (NOT `new Board(width, height)` which takes a signMap 2D array). `board.signMap` returns `number[][]`, `board.get(vertex)` returns sign
    - go-board npm: https://www.npmjs.com/package/@sabaki/go-board
    - Research: Shudan, MIT, powers Sabaki (2.7k stars)
  Acceptance criteria: Dev server shows a wooden-style Go board with grid lines, star points, and coordinate labels. Changing the dropdown resizes the board (9→13→19). Clicking any intersection logs `[x, y]` to console. `bunx tsc --noEmit` exits 0. Playwright screenshot shows a visible board grid.
  QA scenarios:
    - Happy: Playwright `page.goto`, `page.locator('select').selectOption('13')`, screenshot shows 13x13 grid with star points. Click on center intersection `(6,6)`, verify console log. Evidence: `.omo/evidence/task-2-baduk-mvp-13x13.png`.
    - Failure: Verify clicking outside the board does NOT trigger `onVertexClick` (click on padding). Shudan handles this — verify `page.locator('.shudan').getBoundingClientRect()` is within app container. Evidence: `.omo/evidence/task-2-baduk-mvp-edgeclick.txt`.
  Commit: Y | feat(board): render interactive goban with shudan, board size selector

- [x] 3. Game rules integration: stone placement, captures, ko, pass
  What to do: Create `src/lib/gameState.ts` — a module wrapping `@sabaki/go-board` that manages the current board state and current player turn. Export a `createGameState(size)` function returning `{ board: Board, currentPlayer: 1 | -1, makeMove(vertex): boolean, pass(): void, getSignMap(): number[][] }`. Use `Board.fromDimensions(size, size)` to create an empty board. `makeMove` calls `board.makeMove(sign, vertex, { preventOverwrite: true, preventSuicide: true, preventKo: true })` — NOTE parameter order is `(sign, vertex[, options])` NOT `(vertex, sign)`. By default go-board does NOT reject illegal moves; you MUST pass the `prevent*` options. When a move is illegal, `makeMove` THROWS an Error (not returns `null`), so wrap in try/catch — if it throws, return `false` (move rejected); if it succeeds, reassign `board = newBoard`, flip `currentPlayer`, return `true`. `pass()` just flips `currentPlayer` without placing. Wire `Board.tsx`'s `onVertexClick` to call `makeMove` and update the signMap. If `makeMove` returns `false`, the UI layer (Board.tsx) should flash a brief red border on the board container for 200ms (this is UI behavior, not game logic). After each legal move, update the Shudan `signMap` prop to trigger re-render.
  Must NOT do: Do NOT implement undo/redo (T4). Do NOT implement SGF I/O (T5). Do NOT implement superko — `preventKo: true` handles simple ko only. Do NOT implement scoring. Do NOT put the red-border UI flash in gameState.ts — keep gameState pure logic, put the flash in Board.tsx.
  Parallelization: Wave 2 | Blocked by: T1, T2 | Blocks: T4, T6, T7
  References:
    - go-board API: `import Board from '@sabaki/go-board'`
    - `Board.fromDimensions(width: number, height: number): Board` — creates empty board (NOT `new Board(width, height)` which takes a signMap 2D array)
    - `board.makeMove(sign: number, vertex: [number, number], options?: { preventOverwrite?: boolean, preventSuicide?: boolean, preventKo?: boolean }): Board` — CRITICAL: parameter order is `(sign, vertex)` NOT `(vertex, sign)`. Returns a NEW Board. THROWS an Error (not returns null) when the move violates a `prevent*` constraint. Always reassign: `board = board.makeMove(sign, vertex, { preventOverwrite: true, preventSuicide: true, preventKo: true })` wrapped in try/catch.
    - `board.signMap` — `number[][]`, `1` = black, `-1` = white, `0` = empty
    - `board.get(vertex)` — returns sign at vertex
    - go-board source: https://github.com/SabakiHQ/go-board
    - Shudan signMap convention matches go-board: `1` = black, `-1` = white, `0` = empty
    - Research: go-board v1.4.1 (latest npm v1.4.3), MIT, used by Sabaki in production
  Acceptance criteria: Clicking an empty intersection places a stone of the current player's color. Clicking an occupied intersection does nothing (no stone placed). A stone group with zero liberties is captured (removed from board). A move that would immediately recapture in a ko position is rejected. Pass button flips the turn. `bunx tsc --noEmit` exits 0.
  QA scenarios:
    - Happy (capture): Place black at (0,0), white at (0,1), black at (1,0) — white at (0,1) has 0 liberties and is captured. Run unit test `test('capture removes group with no liberties', () => { ... })` via `bun run test`. Evidence: `.omo/evidence/task-3-baduk-mvp-capture-test.txt`.
    - Happy (ko): Set up a ko position (cross-capture), verify that the immediate recapture is rejected. `test('ko prevents immediate recapture', () => { ... })`. Evidence: `.omo/evidence/task-3-baduk-mvp-ko-test.txt`.
    - Failure (suicide): Attempt to place a stone in a space where it would have 0 liberties and captures nothing — `makeMove` throws due to `preventSuicide`, gameState returns `false`, board unchanged. `test('suicide move rejected', () => { ... })`. Evidence: `.omo/evidence/task-3-baduk-mvp-suicide-test.txt`.
    - Failure (occupied): Clicking on an existing stone does nothing — `makeMove` throws due to `preventOverwrite`, gameState returns `false`. `test('occupied intersection rejected', () => { ... })`. Evidence: `.omo/evidence/task-3-baduk-mvp-occupied-test.txt`.
  Commit: Y | feat(rules): integrate go-board for captures, ko, pass, stone placement

- [x] 4. Game tree: move history with @sabaki/immutable-gametree for undo/redo
  What to do: Create `src/lib/gameTree.ts` — a module wrapping `@sabaki/immutable-gametree` that records every move (including passes) as a node in a game tree. Export `createGameTree(size)`, `appendMove(tree, vertex, sign): GameTree`, `appendPass(tree, sign): GameTree`, `undo(tree): GameTree | null`, `redo(tree): GameTree | null`, `getCurrentSignMap(tree, size): number[][]`, `getMoveList(tree): { vertex: [number, number] | 'pass', sign: number }[]`. The tree stores moves as SGF-style nodes with `B[x]` / `W[x]` properties. `undo` navigates to the previous node; `redo` navigates to the next. `getCurrentSignMap` replays all moves from root to current node to produce the board state. Update `gameState.ts` (from T3) to also append to the game tree on each move. Add `undo()` and `redo()` functions to the game state module.
  Must NOT do: Do NOT implement variation branching in the UI — linear trunk only. Do NOT show a game tree graph sidebar. Do NOT implement SGF serialization (T5). The tree supports branching but the UI uses the trunk only.
  Parallelization: Wave 3 | Blocked by: T1, T3 | Blocks: T5, T6, T7
  References:
    - immutable-gametree API: `import { GameTree } from '@sabaki/immutable-gametree'`
    - `new GameTree({ getId, root })` — root node has `{ id, data: {}, parentId: null, children: [] }`
    - `tree.mutate(draft => { ... })` returns NEW GameTree (immutable)
    - `tree.get(id)` returns node
    - `tree.navigate(id, step, currents)` — navigate `step` steps from `id` along currents (default first child). Use `step=-1` for undo (to parent), `step=1` for redo (to first child). There is NO `getCurrent` method.
    - `tree.listNodesVertically(startId, step, currents)` — walks from startId. Use `step=-1` to walk up to root.
    - SGF coordinates: lowercase letters `a` through `s` (for 19x19), where `'a' = 0`
    - `tree.listNodesVertically(id, -1, {})` — walks from node to root
    - immutable-gametree source: https://github.com/SabakiHQ/immutable-gametree
    - Sabaki's gametree.js reference (how they get board from tree): https://github.com/SabakiHQ/Sabaki/blob/master/src/modules/gametree.js
    - Research: immutable-gametree v1.9.4, MIT, used by Sabaki
    - Board state derivation: walk from root to current node, replay each `B[]`/`W[]` move through go-board
  Acceptance criteria: After placing 3 stones, `undo()` returns the board to the state after 2 stones. `redo()` returns to the state after 3 stones. `getMoveList` returns the correct sequence. After undo + new move, the tree branches (but UI shows the new trunk). `bunx tsc --noEmit` exits 0.
  QA scenarios:
    - Happy: Play 5 moves, undo 2, verify board matches 3 moves. `test('undo restores previous board state', () => { ... })`. Evidence: `.omo/evidence/task-4-baduk-mvp-undo-test.txt`.
    - Happy: Play 3 moves, undo 1, redo 1, verify board matches 3 moves. `test('redo restores next board state', () => { ... })`. Evidence: `.omo/evidence/task-4-baduk-mvp-redo-test.txt`.
    - Failure: Undo from root (no moves) returns null / does nothing. `test('undo at root is no-op', () => { ... })`. Evidence: `.omo/evidence/task-4-baduk-mvp-undo-root-test.txt`.
  Commit: Y | feat(history): integrate immutable-gametree for undo/redo move navigation

- [x] 5. SGF I/O: save and load game records in FF[4] format
  What to do: Create `src/lib/sgfIo.ts` — a module using `@sabaki/sgf` to serialize and parse SGF files. Export `treeToSGF(tree: GameTree): string` and `sgfToTree(sgf: string): GameTree`. `treeToSGF` uses `@sabaki/sgf`'s `stringify([tree.root])` to produce FF[4] compliant text — CRITICAL: `stringify` takes an array of root node objects (`NodeObject[]`), NOT a GameTree. Pass `[tree.root]` not `tree`. Export `downloadSGF(tree, filename)` — creates a Blob, uses `URL.createObjectURL`, triggers an `<a>` download. Export `loadSGFFile(file: File): Promise<GameTree>` — reads file text, parses with `@sabaki/sgf`'s `parse()` which returns `NodeObject[]` (root nodes, NOT GameTree[]). You must wrap the first root node in `new GameTree({ getId, root: parsedNodes[0] })` to get a GameTree. After parsing, when loading an SGF with a different board size, set the board size from the SGF `SZ` property and update the board-size `<select>` to reflect the loaded size. Wire into the UI: a "Save SGF" button and a "Load SGF" file input (`<input type="file" accept=".sgf">`).
  Must NOT do: Do NOT support SGF setups (AB/AW/AE) — only move records. Do NOT support SGF annotations/comments (C, LB, TR, etc.) — phase 2. Do NOT support multiple games in one SGF — first parsed root node only.
  Parallelization: Wave 4 | Blocked by: T4 | Blocks: T6, T7
  References:
    - @sabaki/sgf API: `import { stringify, parse } from '@sabaki/sgf'`
    - `stringify(nodes: NodeObject[], options?: { linebreak: string }): string` — takes array of root node objects (NOT a GameTree). Use `stringify([tree.root])`.
    - `parse(contents: string, options?: { errorOptions?: ... }): NodeObject[]` — returns array of root node objects (NOT GameTree[]). Wrap with `new GameTree({ getId, root: nodes[0] })`.
    - @sabaki/sgf npm: https://www.npmjs.com/package/@sabaki/sgf (v3.4.7)
    - Integration example with immutable-gametree is in @sabaki/sgf README
    - SGF spec: https://red-bean.com/sgf/sgf4.html
    - Key SGF properties: `FF[4]` (format), `GM[1]` (game=Go), `SZ[19]` (board size), `B[xy]` / `W[xy]` (moves), `[]` (pass)
    - SGF coordinate convention: lowercase letters, 'a'=0, 'b'=1, ... 's'=18 (for 19x19). Pass = `[]` (empty value)
    - Blob download pattern: `const blob = new Blob([sgfText], { type: 'application/x-go-sgf' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'game.sgf'; a.click(); URL.revokeObjectURL(url);`
    - File input pattern: `<input type="file" accept=".sgf,text/plain" onChange={handleFile} />`
    - Research: @sabaki/sgf v3.4.7, MIT, FF[4] compliant
    - @sabaki/sgf npm: https://www.npmjs.com/package/@sabaki/sgf
    - SGF spec: https://red-bean.com/sgf/sgf4.html
    - Key SGF properties: `FF[4]` (format), `GM[1]` (game=Go), `SZ[19]` (board size), `B[xy]` / `W[xy]` (moves), `[]` (pass)
    - SGF coordinate convention: lowercase letters, 'a'=0, 'b'=1, ... 's'=18 (for 19x19). Pass = `[]` (empty value)
    - Blob download pattern: `const blob = new Blob([sgfText], { type: 'application/x-go-sgf' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'game.sgf'; a.click(); URL.revokeObjectURL(url);`
    - File input pattern: `<input type="file" accept=".sgf,text/plain" onChange={handleFile} />`
    - Research: @sabaki/sgf v3.4.7, MIT, FF[4] compliant
  Acceptance criteria: After playing several moves, "Save SGF" downloads a `.sgf` file. The file contains `FF[4] GM[1] SZ[19]` header and `B[xx];W[yy]` move sequences. "Load SGF" reads the file back and restores the exact board position. Round-trip test: save → load → board matches. `bunx tsc --noEmit` exits 0.
  QA scenarios:
    - Happy: Play 10 moves, save SGF, load it back, verify all 10 stones are on the correct intersections. `test('SGF round-trip preserves game state', () => { ... })`. Evidence: `.omo/evidence/task-5-baduk-mvp-sgf-roundtrip.sgf` (the actual SGF file) + `.omo/evidence/task-5-baduk-mvp-sgf-roundtrip-test.txt` (test output).
    - Failure: Load a malformed SGF (e.g., `(;FF[4]GM[1]SZ[19]B[zz])` where 'z' is out of range) — should handle gracefully (error message or skip invalid move). `test('malformed SGF handled gracefully', () => { ... })`. Evidence: `.omo/evidence/task-5-baduk-mvp-sgf-malformed-test.txt`.
    - Failure: Load a non-SGF file (e.g., `hello world`) — `parse` should throw or return empty. `test('non-SGF content rejected', () => { ... })`. Evidence: `.omo/evidence/task-5-baduk-mvp-sgf-nonsgf-test.txt`.
  Commit: Y | feat(sgf): save and load game records in SGF FF[4] format

- [x] 6. UI control bar: new game, pass, undo, redo, coordinates toggle
  What to do: Create `src/components/ControlBar.tsx` — a horizontal bar above the board with buttons: "New Game" (resets to empty board, keeps current size), "Pass" (calls `pass()`), "Undo" (calls `undo()`), "Redo" (calls `redo()`), "Save SGF" (calls `downloadSGF`), "Load SGF" (file input), and a "Coordinates" toggle checkbox (toggles Shudan's `showCoordinates` prop). Also add a "Board Size" `<select>` with options 9, 13, 19 (moved from the temporary dropdown in T2). Add a "Move N" display showing the current move number. Add a "To Play: Black/White" indicator showing whose turn it is. Disable "Undo" when at root, disable "Redo" when at leaf. Wire all buttons to the game state module from T3+T4. Use CSS for a clean, minimal layout — flexbox row, gap, buttons with padding, a dark background to make the wood board pop.
  Must NOT do: Do NOT add timer/clock UI. Do NOT add score display. Do NOT add settings panel. Do NOT add board theme picker. Do NOT add variation/branch switcher. Keep it minimal.
  Parallelization: Wave 5 | Blocked by: T2, T3, T4, T5 | Blocks: T8 | Can parallelize with: T7
  References:
    - gameState module (T3): `makeMove`, `pass`, `getSignMap`, `currentPlayer`
    - gameTree module (T4): `undo`, `redo`, `getMoveList`
    - sgfIo module (T5): `downloadSGF`, `loadSGFFile`
    - Shudan `showCoordinates` prop: boolean, toggles A-T / 1-19 labels
    - Shudan `markerMap` prop: `{ [x]: { [y]: { type: 'point' } } }` for the last-move marker (there is NO `showLastMoveMarker` prop — use `markerMap` with `{type: 'point'}` at the last-move vertex)
    - CSS approach: `display: flex; flex-direction: row; gap: 8px; padding: 12px; background: #1a1a2e;` (dark navy to contrast wood board)
    - Button styling: `padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer; font-size: 14px;`
    - Disabled state: `opacity: 0.5; cursor: not-allowed;`
    - To Play indicator: colored circle (black/white) next to text
  Acceptance criteria: All UI controls are visible and functional (New Game, Pass, Undo, Redo, Save SGF, Load SGF, Coordinates toggle, Board Size select, Move counter, Turn indicator = 10 elements). "New Game" clears the board. "Pass" flips turn. "Undo" reverts one move (disabled at root). "Redo" re-applies one move (disabled at leaf). "Save SGF" downloads a file. "Load SGF" accepts a file and restores the board. "Coordinates" toggle shows/hides labels. "Board Size" changes the board (changing mid-game resets to empty board — no confirmation). Move counter shows correct number. Turn indicator shows correct color. `bunx tsc --noEmit` exits 0.
  QA scenarios:
    - Happy: Play 3 moves, click Undo, verify only 2 stones visible and move counter shows "Move 2". Click Redo, verify 3 stones again. Evidence: `.omo/evidence/task-6-baduk-mvp-undo-redo.png` (Playwright screenshot).
    - Happy: Click "New Game", verify board is empty. Toggle Coordinates off, verify labels disappear. Evidence: `.omo/evidence/task-6-baduk-mvp-newgame.png` + `.omo/evidence/task-6-baduk-mvp-no-coords.png`.
    - Failure: At game start (root), "Undo" button should be disabled (opacity 0.5). Playwright `page.locator('button:has-text("Undo")').isDisabled()` returns true. Evidence: `.omo/evidence/task-6-baduk-mvp-undo-disabled.txt`.
  Commit: Y | feat(ui): control bar with new game, pass, undo, redo, sgf, coordinates

- [x] 7. Unit tests: Vitest game logic test suite
  What to do: Create `src/lib/__tests__/gameState.test.ts` — comprehensive Vitest test suite for the game logic. Test cases: (a) place stone on empty intersection → appears on board, (b) place on occupied → rejected, (c) place on another stone's liberty → no capture, (d) fill all liberties of a group → group captured, (e) multi-stone group capture, (f) simple ko: setup cross-capture → immediate recapture rejected, (g) suicide move rejected, (h) pass flips turn without placing, (i) board size 9/13/19 initializes correctly, (j) undo restores previous state, (k) redo after undo restores, (l) undo at root is no-op, (m) SGF round-trip: play moves → save → load → board matches, (n) SGF parse malformed input → handles gracefully. Add `vitest.config.ts` with `environment: 'jsdom'` and `setupFiles: ['./src/test-setup.ts']` (imports `@testing-library/preact`). Configure `bun run test` to run Vitest in watch mode and `bun run test:run` for CI (single run).
  Must NOT do: Do NOT test Shudan rendering (that's E2E in T8). Do NOT test UI components. Do NOT use Playwright here — pure Vitest only. Do NOT mock go-board or immutable-gametree — test through real libraries.
  Parallelization: Wave 6 | Blocked by: T3, T4, T5 | Blocks: nothing | Can parallelize with: T8
  References:
    - Vitest config: `import { defineConfig } from 'vitest/config'` with `test: { environment: 'jsdom', globals: true }`
    - jsdom setup: `bun add -d jsdom`
    - @testing-library/preact: `bun add -d @testing-library/preact`
    - Test pattern: `import { describe, it, expect } from 'vitest'` — `describe('captures', () => { it('removes group with no liberties', () => { ... }) })`
    - go-board API for test setup: `Board.fromDimensions(size, size)` (NOT `new Board(size)`), `board.makeMove(sign, [x, y], { preventOverwrite: true, preventSuicide: true, preventKo: true })` (note `(sign, vertex)` parameter order), `board.signMap`
    - gameState module API (T3): `createGameState(size)`, `makeMove(vertex)`, `pass()`, `getSignMap()`
    - gameTree module API (T4): `createGameTree(size)`, `appendMove`, `undo`, `redo`, `getMoveList`
    - sgfIo module API (T5): `treeToSGF(tree)`, `sgfToTree(sgf)`
    - Ko test setup: construct a known ko position programmatically — see https://senseis.xmp.net/?Ko for canonical examples. A proper ko requires both players' stones to have exactly 1 shared liberty. Verify the position by checking that `makeMove` with `preventKo: true` rejects the recapture AFTER a capture has occurred. Do NOT hardcode SGF coordinate strings without first verifying the position produces a single-stone capture followed by an immediate recapture attempt.
  Acceptance criteria: `bun run test:run` exits 0 with all tests passing. At least 14 test cases exist. Coverage of game logic modules (`gameState.ts`, `gameTree.ts`, `sgfIo.ts`) is ≥80% (run `bunx vitest run --coverage`). Evidence: `.omo/evidence/task-7-baduk-mvp-coverage.txt` (coverage report).
  QA scenarios:
    - Happy: `bun run test:run` — all tests pass. Evidence: `.omo/evidence/task-7-baduk-mvp-test-output.txt`.
    - Failure: Intentionally break one assertion (e.g., assert capture does NOT happen when it should) — verify Vitest exits with non-zero. `bun run test:run 2>&1 | grep -q "FAIL"` should succeed. Evidence: `.omo/evidence/task-7-baduk-mvp-test-failure.txt`.
  Commit: Y | test(unit): vitest suite for captures, ko, undo/redo, sgf round-trip

- [x] 8. E2E tests: Playwright board interaction and SGF round-trip
  What to do: Create `e2e/board.spec.ts` — Playwright test file testing the full user flow. Create a fixture `e2e/fixtures/test-game.sgf` with a known 5-move game on a 19x19 board (e.g., `(;FF[4]GM[1]SZ[19];B[pd];W[dc];B[ce];W[ed];B[de])`). Test scenarios: (a) Load page → see empty board with grid and coordinates, (b) Change board size to 13 → verify 13x13 grid renders, (c) Click intersection → see stone appear, (d) Click adjacent intersections to capture a stone → verify stone disappears, (e) Click Undo → verify last stone removed, (f) Click Redo → verify stone restored, (g) Click Pass → verify turn indicator flips, (h) Save SGF → verify file download, (i) Load SGF → verify board restored, (j) Toggle coordinates → verify labels disappear/reappear, (k) Attempt to place on occupied → verify no second stone. Create `playwright.config.ts` with `webServer` config that auto-starts `bun run dev` on port 5173. Add `bun run e2e` script to `package.json`.
  Must NOT do: Do NOT test unit-level game logic (that's T7). Do NOT test AI integration (phase 2). Do NOT test desktop packaging (phase 2). Do NOT use headed mode in CI — use `headless: true`.
  Parallelization: Wave 6 | Blocked by: T6 | Blocks: nothing | Can parallelize with: T7
  References:
    - Playwright config: `import { defineConfig } from '@playwright/test'`
    - `webServer: { command: 'bun run dev', port: 5173, reuseExistingServer: !process.env.CI }`
    - Browser: `chromium` only for MVP (add firefox/webkit later)
    - Shudan DOM structure (verified against README): the board container has class `shudan-goban` (NOT `shudan`). Stones are rendered as elements with class `shudan-stone-image` (NOT `shudan-stone`). Grid lines are SVG `<line>` elements inside the container. Star points are SVG `<circle>` elements. Inspect the actual DOM during test writing and adjust selectors as needed.
    - Selector patterns: `page.locator('.shudan-goban')` for board, `page.locator('button:has-text("Undo")')` for controls, `page.locator('select')` for board size, `page.locator('.shudan-stone-image')` for stones (count to verify placement)
    - File download test: `const download = await page.waitForEvent('download'); expect(download.suggestedFilename()).toContain('.sgf');`
    - File upload test: `page.setInputFiles('input[type=file]', 'e2e/fixtures/test-game.sgf')`
    - Playwright docs: https://playwright.dev/docs/api/class-page
    - Capture test setup (same as T7 ko test): place specific stones to create a capture scenario
  Acceptance criteria: `bun run e2e` exits 0 with all ≥11 E2E tests passing. Screenshots from each test are saved to `.omo/evidence/task-8-baduk-mvp-e2e-*.png`. Playwright HTML report generated at `e2e-report/`.
  QA scenarios:
    - Happy: Full flow test — start app, play 5 moves, undo 2, save SGF, load SGF back, verify 3 stones on board. `bun run e2e -- --grep "full game flow"`. Evidence: `.omo/evidence/task-8-baduk-mvp-e2e-fullflow.png`.
    - Failure: Verify that playing on an occupied point does not add a stone — `expect(page.locator('.shudan-stone-image')).toHaveCount(1)` after second click on same point. Evidence: `.omo/evidence/task-8-baduk-mvp-e2e-occupied.png`.
  Commit: Y | test(e2e): playwright tests for board interaction, undo/redo, sgf round-trip

## Final verification wave
> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.
- [x] F1. Plan compliance audit
  Acceptance: Compare each todo's commit against the plan. `git log --oneline` shows commits for all 8 todos. Each commit message matches the planned `<type>(<scope>): <summary>` format. No extra files outside the planned scope. Evidence: `.omo/evidence/f1-compliance.txt` (git log + diff stat).
- [x] F2. Code quality review
  Acceptance: `bunx tsc --noEmit` exits 0. `grep -rn ': any' src/ --include='*.ts' --include='*.tsx' | grep -v node_modules` returns 0 hits (no `any` types). `grep -rn 'console\.log\|debugger' src/ --include='*.ts' --include='*.tsx' | grep -v __tests__ | grep -v node_modules` returns 0 hits (no debug logs in production code). Evidence: `.omo/evidence/f2-quality.txt`.
- [x] F3. Automated full-flow QA
  Acceptance: `bun run e2e` exits 0 with all ≥11 tests passing. `bun run test:run` exits 0 with all ≥14 tests passing. Playwright HTML report at `e2e-report/index.html`. No human interaction needed — all tests are automated. Evidence: `.omo/evidence/f3-e2e-report.txt` + `e2e-report/index.html`.
- [x] F4. Scope fidelity
  Acceptance: `grep -rliE 'katago|gtp|leela|tauri|electron|wails|websocket|socket\.io|byo.?yomi|fischer|handicap|superko|scoring' src/ --include='*.ts' --include='*.tsx' | grep -v node_modules` returns 0 hits. No AI integration, no desktop wrapper, no online features, no scoring features present in the codebase. Evidence: `.omo/evidence/f4-scope.txt`.

## Commit strategy
- Every todo gets its own atomic commit with a Conventional Commit message (see per-todo `Commit:` lines).
- Commit format: `<type>(<scope>): <summary>` where type is `feat`, `test`, `chore`, `fix`.
- Branch: work on `main` directly for MVP (no feature branch needed for solo project).
- After all todos: squash is NOT needed — keep granular history for this prototype phase.
- Final commit after verification wave: `chore(verify): final verification wave complete`.

## Success criteria
1. `bun install` and `bun run dev` start the app with zero errors
2. A empty 19x19 Go board renders with grid, star points, and coordinate labels
3. Two players alternate placing stones by clicking
4. Captures work: zero-liberty groups are removed automatically
5. Ko rule works: immediate single-stone recapture is prevented
6. Pass, Undo, Redo all work via buttons
7. SGF save downloads a valid FF[4] `.sgf` file; SGF load restores the game
8. Board size selector switches between 9x9, 13x13, 19x19
9. `bun run test:run` passes all unit tests (≥14 cases)
10. `bun run e2e` passes all E2E tests (≥11 cases)
11. `bunx tsc --noEmit` exits 0 (no TypeScript errors)
12. No AI integration, desktop wrapper, or online features present in the codebase
