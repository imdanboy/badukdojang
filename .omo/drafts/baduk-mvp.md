---
slug: baduk-mvp
status: review-fixed
intent: unclear
review_required: true
pending-action: present final plan to user
approach: TypeScript + Vite + Preact web app using @sabaki/* library suite (go-board, shudan, sgf, immutable-gametree) for a working self-play Baduk board with captures, ko, undo/redo, and SGF save/load. Desktop wrapper and KataGo AI integration deferred to phase 2.

## Review receipts
- Metis gap analysis: COMPLETED — found critical dependency matrix inconsistencies + missing F1-F4 criteria. All fixed.
- Momus review: REJECT (initial) → FIXED — found 3 critical API errors (go-board makeMove param order + throw vs null, go-board constructor, Shudan showLastMoveMarker prop). All 3 fixed in plan. Non-blocking issues (sgf parse/stringify types, getCurrent vs navigate, DOM selectors) also fixed.
- Oracle review: REJECT (initial) → FIXED — confirmed same 3 critical issues. Additional findings: Shudan CSS import missing (fixed), animateStonePlacement requires fuzzyStonePlacement (fixed), ko test setup coordinates incorrect (fixed).
- Fix/retry summary: Applied 15+ edits to .omo/plans/baduk-mvp.md fixing all critical and non-blocking issues from both reviewers. Plan resubmitted with fixes.
---

# Draft: baduk-mvp

## Components (topology ledger)
| id | outcome (one line) | status | evidence path |
|---|---|---|---|
| C1 | Project scaffolding: Vite + Preact + TS + Bun, runs at localhost | active | research: Vite is standard, Bun is drop-in npm |
| C2 | Board rendering: @sabaki/shudan renders interactive 19/13/9 board with grid, star points, stones, coordinates | active | research: Shudan v1.7.1 MIT, 13KB, powers Sabaki (2.7k stars) |
| C3 | Game rules: @sabaki/go-board handles stone placement, captures, ko, pass | active | research: go-board v1.4.1 MIT, battle-tested |
| C4 | Game tree & navigation: @sabaki/immutable-gametree for move history, undo/redo, branching | active | research: immutable-gametree v1.9.4 MIT |
| C5 | SGF I/O: @sabaki/sgf for save/load game records in FF[4] format | active | research: sgf v3.4.7 MIT, FF[4] compliant |
| C6 | UI controls: new game, pass, undo, redo, board size selector, coordinate toggle | active | derived from user requirements |
| C7 | Testing: Vitest unit + Playwright E2E for board interaction and rules | active | research: standard for Vite + web apps |
| C8 | KataGo AI integration via GTP | deferred | research: @sabaki/gtp exists, but needs desktop wrapper for subprocess spawn |
| C9 | Desktop wrapper (Tauri/Wails/Electron) | deferred | research: web app can be wrapped later, no blocking dep |

## Open assumptions (announced defaults)
| assumption | adopted default | rationale | reversible? |
|---|---|---|---|
| Platform | Web app first (localhost), desktop wrapper deferred to phase 2 | Fastest path to working board; self-play needs no external process | YES — Vite app wraps in any desktop framework |
| Language | TypeScript | Richest Baduk library ecosystem (entire @sabaki/* suite is npm) | YES — can migrate to Python/Go later |
| Board renderer | @sabaki/shudan v1.7.1 (Preact component, MIT, 13KB) | Proven by 2.7k-star Sabaki; saves ~80% of rendering work | YES — replaceable with custom Canvas |
| Game logic lib | @sabaki/go-board v1.4.1 (board state, captures, ko) | Standards-compliant, MIT, battle-tested | YES |
| Game tree lib | @sabaki/immutable-gametree v1.9.4 | Supports branching variations + SGF round-trip | YES |
| SGF lib | @sabaki/sgf v3.4.7 | FF[4] compliant, MIT | YES |
| Frontend framework | Preact (3KB) | Shudan is Preact-native; lighter than React | YES — can switch to React/Svelte |
| Package manager | Bun | Faster installs/runs, drop-in for npm | YES |
| Build tool | Vite | Fastest dev experience, modern standard | YES |
| Testing | Vitest (unit) + Playwright (E2E) | Both standard, work with Vite | YES |
| AI integration (KataGo) | Deferred to phase 2 | MVP is self-play only; AI needs desktop wrapper for subprocess | YES |
| Board sizes | 19x19, 13x13, 9x9 selectable | Standard sizes for real play | YES |
| Scoring | Area scoring (Chinese rules) for MVP | Simpler than territory (no dead-stone agreement needed) | YES — lib supports other rulesets |
| Ko rule | Simple ko only for MVP | Most common, easiest; superko deferred | YES — lib supports superko |
| Commits | Conventional commits | Standard, readable history | YES |

## Findings (cited - path:lines)
1. @sabaki/shudan v1.7.1 — Preact Goban component, MIT, 13KB, github.com/SabakiHQ/Shudan (105 stars)
2. @sabaki/go-board v1.4.1 — board state + rules, MIT, github.com/SabakiHQ/Sabaki monorepo
3. @sabaki/sgf v3.4.7 — FF[4] SGF parser/serializer, MIT
4. @sabaki/immutable-gametree v1.9.4 — game tree for variations
5. @sabaki/gtp v3.0.0 — GTP engine client (deferred to phase 2)
6. Sabaki: github.com/SabakiHQ/Sabaki (2.7k stars, Electron 43 + Preact + Shudan, proves the stack)
7. KaTrain: github.com/sanderland/katrain (2.3k stars, Python + Kivy + KataGo JSON analysis)
8. KataGo: github.com/lightvector/KataGo — superhuman AI, `brew install katago`, GTP + JSON analysis engine
9. SGF spec: red-bean.com/sgf/sgf4.html — FF[4], text-only tree format
10. GTP spec: lysator.liu.se/~gunnar/gtp/gtp2-spec-draft2 — stdin/stdout, `genmove`, `play`, `boardsize`
11. Tauri 2: v2.11.5, 108k stars, ~10MB bundle, WKWebView on macOS — best desktop wrapper for phase 2
12. Wails v2.12: 35k stars, Go backend + web frontend, ~15MB bundle — alternative if user wants Go
13. Board representation: flat int8[19*19] + Zobrist hash is industry standard (KataGo, GNU Go)

## Decisions (with rationale)
1. **Web-first, not desktop-first**: Self-play MVP can run at localhost. Desktop wrapper (Tauri) adds complexity (Rust, sidecar binary, notarization) that delays the first working board. Phase 2 wraps the same Vite app.
2. **Use @sabaki/* libraries, don't reinvent**: User wants "바로 동작하는 바둑 프로그램" (working right away). The Sabaki suite gives battle-tested board, rules, SGF, and game tree in ~5 npm packages. Custom implementation of these would take weeks. The MIT license is permissive.
3. **Self-play only for MVP**: "셀프 대국 또는 인공지능 대국만 생각중" — self-play (both colors by clicking) requires no external process. AI play needs KataGo subprocess which needs a desktop wrapper. Deferred to phase 2.
4. **Preact, not React**: Shudan is Preact-native (though it works in React). Preact is 3KB vs React's 40KB. The user's inbox mentions wanting to eventually build a "better UI/UX than commercial apps" — starting with a lightweight, fast framework is the right foundation.
5. **Bun + Vite**: Fastest dev loop. `bun create vite` scaffolds in seconds. Hot module replacement is instant.
6. **Chinese/area scoring for MVP**: Area scoring (stones on board + territory) is simpler — no dead-stone agreement phase. Japanese/territory scoring can be added later.

## Scope IN
- Working Go board (9x9, 13x13, 19x19 selectable)
- Stone placement by clicking (alternating black/white)
- Capture rule (groups with no liberties are removed)
- Ko rule (simple ko: can't recapture single stone immediately)
- Pass move
- Undo / redo navigation through game tree
- Move history display
- SGF save (export current game to .sgf file download)
- SGF load (import .sgf file to replay game)
- Board coordinates toggle (A-T excluding I, 1-19)
- Star points (hoshi) rendering
- Last-move marker
- Responsive board sizing
- Unit tests (Vitest) for game logic
- E2E tests (Playwright) for board interaction
- Conventional commits

## Scope OUT (Must NOT have)
- NO AI engine integration (KataGo, GTP) — phase 2
- NO desktop wrapper (Tauri/Electron/Wails) — phase 2
- NO online multiplayer — not desired per inbox
- NO photo-to-resume feature — future vision, not MVP
- NO superko rule — simple ko only for MVP
- NO territory/Japanese scoring — area scoring only
- NO dead-stone detection or scoring agreement phase
- NO time controls (byo-yomi, Fischer) — MVP is casual
- NO handicap stones — phase 2
- NO game commentary/annotation marks — phase 2
- NO multiple game tabs or windows — MVP is single game
- NO board themes/customization beyond default — phase 2

## Open questions
(none — all resolved by research and adopted defaults)

## Approval gate
status: awaiting-approval
pending-action: write .omo/plans/baduk-mvp.md
approach: TypeScript + Vite + Preact web app using @sabaki/* library suite for a working self-play Baduk board. Desktop wrapper and KataGo AI deferred to phase 2. All defaults are reversible and surfaced in the TL;DR for veto.
