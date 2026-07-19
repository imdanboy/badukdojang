---
title: KataGo 엔진 통합 — 사전 연구
description: Phase-2 엔진 연동 전 조사 — KataGo 기능/모델/튜닝, Pachi·GNU Go 약 엔진 비교, badukdojang 통합 지점
tags: [katago, engines, planning, research]
created: 2026-07-18
updated: 2026-07-18 (설치·사용법 섹션 추가)
---

# KataGo 엔진 통합 — 사전 연구

> `docs/ideas.md`의 Inbox 요청(L13-20)에 대한 응답. 엔진 연동 착수 전에 KataGo가 제공하는 기능, 다운로드 가능한 모델, 튜닝 파라미터, 더 약한 엔진 대안을 조사했다. 본 노트는 `.omo/drafts/katago-engine-research.md`에서 영속 위키로 승격한 버전이며, 모든 클레임은 검증 가능한 URL에 기반한다.

## 핵심 결론 (TL;DR)

**badukdojang(MacBook Air, 10급 아마추어)에는 KataGo `b18c384nbt`가 1순위.**

| 용도 | 추천 설정 | 출처 |
|---|---|---|
| ~10급 AI와 대국 (빠른 길) | KataGo `kata1-b18c384nbt-s7372662272-d3626729126.bin.gz` + `maxVisits=40-200`, `numSearchThreads=2` Metal + (옵션) `humanSLProfile=rank_10k` with `b18c384nbt-humanv0` | [README "Which network"](https://github.com/lightvector/KataGo), [gtp_human5k_example.cfg](https://github.com/lightvector/KataGo/blob/master/cpp/configs/gtp_human5k_example.cfg) |
| 게임 복기 / 형세 분석 / 다음 수 힌트 | 동일 `b18c384nbt`를 `katago analysis` 모드로 운용, `includeOwnership:true, includePolicy:true` → 승률%, scoreLead, ownership heatmap | [Analysis_Engine.md](https://github.com/lightvector/KataGo/blob/master/docs/Analysis_Engine.md) |
| 순수-MCTS 약한 상대 | Pachi 12.90 `--nodcnn -t =300` (~10급 보정) | [katrain#44](https://github.com/sanderland/katrain/issues/44) |
| 의존성 제로 / 플레이 전용 파트너 | GNU Go 3.8 `--mode gtp --level 8` (~10급) | [katrain#44](https://github.com/sanderland/katrain/issues/44) |
| 종국 계가 (죽은돌 판정+점수) | KataGo GTP `final_status_list` + `final_score` 둘 다 구현됨 | `cpp/command/gtp.cpp:3210,3228` |

## 설치 및 사용법 (없으면 AI 대국 불가)

> ⚠️ **이 섹션은 필수입니다.** 설정을 안 하면 설정 패널의 "엔진 켜짐" 토글을 눌러도 아무 일도 일어나지 않습니다.

### 사전 준비

- [Bun](https://bun.sh) (Vite dev server + KataGo bridge 실행용)
- [KataGo](https://github.com/lightvector/KataGo)

```bash
brew install katago
katago version   # 1.16.x 이상 확인
```

### 1단계: 모델 파일 다운로드 (한 번만)

```bash
mkdir -p ~/katago-models

# 기본 네트워크 (s6582M, 가장 강한 b18 모델)
curl -L -o ~/katago-models/kata1-b18c384nbt.bin.gz \
  https://media.katagotraining.org/uploaded/networks/models/kata1/kata1-b18c384nbt-s6582191360-d3422816034.bin.gz

# Human-SL 네트워크 — 인간 이동 예측 모델
curl -L -o ~/katago-models/b18c384nbt-humanv0.bin.gz \
  https://media.katagotraining.org/uploaded/networks/models_extra/b18c384nbt-humanv0.bin.gz
```

### 2단계: 환경변수 설정 (터미널마다, 또는 `~/.zshrc`에 추가)

```bash
export KATAGO_MODEL_PATH="$HOME/katago-models/kata1-b18c384nbt.bin.gz"
export HUMAN_MODEL_PATH="$HOME/katago-models/b18c384nbt-humanv0.bin.gz"
# 선택 — 기본값과 다를 경우:
# export KATAGO_BINARY=katago
# export KATAGO_CONFIG_PATH=/opt/homebrew/Cellar/katago/1.16.4/share/katago/configs/gtp_example.cfg
# export PORT=8787
```

### 3단계: 두 개 터미널 실행

```bash
# Terminal 1 — KataGo bridge (먼저 켜야 함)
bun run start:engine
# → "KataGo bridge listening on http://localhost:8787"

# Terminal 2 — Vite dev server
bun run dev
```

### 4단계: 브라우저에서 확인

개발자 도구 콘솔(F12)에서:

```js
await fetch('/api/gtp/health').then(r => r.json())
// → { status: "ok", version: "1.16.x", humanModelAvailable: true }
```

이게 실패하면 bridge가 안 켜진 것입니다. **bridge가 켜져 있어야 설정 패널의 "엔진 켜짐" 토글이 의미를 갖습니다.**

### 흔한 에러 메시지와 해결책

| 증상 | 원인 | 해결 |
|---|---|---|
| `"엔진이 꺼져 있습니다"` 토스트 | bridge 서버 미실행 | Terminal 1에서 `bun run start:engine` |
| `"엔진 연결 실패"` / 503 | bridge 켜졌는데 KataGo spawn 실패 | `KATAGO_MODEL_PATH` 환경변수 확인, 모델 파일 존재 확인 (`ls ~/katago-models/`) |
| `"Engine health check failed"` 콘솔 에러 | Vite proxy 실패 | `bun run dev`를 `bun run start:engine` **이후**에 실행 |
| `humanModelAvailable: false` | Human-SL 모델 경로 오류 | `HUMAN_MODEL_PATH` 환경변수 확인 |
| AI 응답 없음 (생각만 함) | `maxTime` 초과 또는 `maxVisits` 너무 큼 | 설정 패널에서 생각시간 5초, 난이도 10급으로 조정 |

### 빠른 디버깅 명령어

```bash
# 1. bridge가 살아있는지 확인
curl http://localhost:8787/api/gtp/health

# 2. KataGo 버전 명령이 작동하는지 확인
curl -X POST http://localhost:8787/api/gtp/command \
  -H "Content-Type: application/json" \
  -d '{"command":"version"}'

# 3. env var 확인
echo $KATAGO_MODEL_PATH
echo $HUMAN_MODEL_PATH

# 4. 파일 존재 확인
ls -lh ~/katago-models/
```

---

## 1. KataGo 기능 — 요청한 5개 모두 YES

| 기능 | 판정 | 정확한 메커니즘 |
|---|---|---|
| 다음 수 추천 | YES | GTP `genmove`, `kata-search` (보드 반영 않음), `kata-genmove_analyze`, `kata-search_cancellable` (취소 가능) |
| 승률 예측 | YES | `kata-analyze` / `lz-analyze` 연속 스트림; analysis JSON의 `moveInfos[].winrate`와 `rootInfo.winrate` (0~1 float) |
| 형세 판단 | YES | `includeOwnership:true` → boardYSize×boardXSize float 배열 [-1,1], A19→T1 행-우선. 이것이 KataGo의 "집 소유" 히트맵 = 형세 판단 |
| 집 차이 계산 | YES | per-move 및 root의 `scoreLead`. (별칭 `scoreMean`; `scoreSelfplay`는 편향되니 비권장) |
| 종국 계가 | YES | GTP `final_score` → 예: `W+2.5`; `final_status_list` → dead/alive/seki/territory 돌 목록. **`cpp/command/gtp.cpp:3210,3228`에서 구현 확인** |

per-move JSON이 돌려주는 추가 필드: `visits`, `lcb`, `prior`, `pv`, `order`, `utility`, `playSelectionValue`, `pvVisits`, `pvEdgeVisits`, `weight`, `edgeWeight`, `noResultValue`, `isSymmetryOf`. 보드 전체 옵션: `ownership`, `ownershipStdev`, `policy`, `humanPolicy`.

엔진 호출 모드 세 가지가 중요:
- `katago gtp` — 라인 기반 GTP stdin/stdout (플레이용)
- `katago analysis` — 라인-JSON stdin/stdout (비동기, 순서 비보장; 복기/형세 UI용)
- `katago benchmark` / `genconfig` / `tuner` — 초기 설정용

## 2. MacBook Air에서 돌릴 모델 카탈로그

네이밍: `b{blocks}c{channels}`. KataGo 저자 README에서 **"weaker machines에도 b18c384nbt가 best net"**이라 명시 — 작은 net이 필요 없음. b28 이상은 Air에서 너무 느림.

| 네트 | 크기 | M3 Max visits/s | 강도 | 라이센스 | 판정 |
|---|---|---|---|---|---|
| `g170-b6c96` | 3.6 MB | ~8,000 | g170 내부 최약 (~ -1184) | CC0 | 장난감 |
| `g170e-b10c128` | 11 MB | ~3,800 | ELF v2급 (~6+ 단 프로) | g170-era CC0 | 빠른 프로 net |
| `g170e-b15c192` | 35 MB | ~1,500 | ≈ ELF v2 (KaTrain 설치본) | CC0 | 가장 빠른 프로급 |
| **`kata1-b18c384nbt-s7372662272-d3626729126.bin.gz`** | **93 MB** | **530-680** | **저자 추천 (약 기기용)** | MIT | **badukdojang 시작점** |
| `b18c384nbt-humanv0.bin.gz` | 94 MB | ~500 (설정상 `maxVisits=40`이라 무의미) | 인간 10급 직접 모방 (`rank_10k` ~ `proyear_*`) | MIT | "인간 10급 봇" 최적 경로 |
| `kata1-b28c512nbt` | 259 MB | 200-310 | 초인간 (내부 Elo ~14107) | MIT | **너무 느림 (Air)** — M1 벤치: 17:40 vs b18 10:25 |
| `kata1-zhizi-b40c768nbt` | 매우 큼 | <100 | 최강 (Elo ~14551) | MIT (hzyhhzy & zhizigo.com) | **Air 제외** |

> **정정**: 네트워크 자체가 "약체화"된 KataGo 모델은 없음. 인간 10급 흉내 경로는 단 하나 — Human-SL 넷(`b18c384nbt-humanv0`) + `humanSLProfile=rank_10k` 설정. 이 청사진이 `gtp_human5k_example.cfg`에 그대로 담겨 있음.

### 직접 다운로드 URL (검증됨)

- `kata1-b18c384nbt-s7372662272-d3626729126.bin.gz` — https://media.katagotraining.org/uploaded/networks/models/kata1/kata1-b18c384nbt-s7372662272-d3626729126.bin.gz
- Human-SL: https://github.com/lightvector/KataGo/releases/download/v1.15.0/b18c384nbt-humanv0.bin.gz (미러: https://media.katagotraining.org/uploaded/networks/models_extra/b18c384nbt-humanv0.bin.gz)
- g170 (KaTrain 설치본): https://katagoarchive.org/g170/neuralnets/g170e-b15c192-s1672170752-d466197061.bin.gz

### MacBook Air 설치

GitHub엔 macOS 바이너리 없음 (v1.16.5 release notes가 명시 "no precompiled exes for Metal"). **`brew install katago`** (1.16.5, Metal+ANE hybrid)가 사실표준. 소스 빌드는 `Compiling.md#macos` (`cmake -G Ninja -DUSE_BACKEND=METAL -DBUILD_DISTRIBUTED=1`).

## 3. 튜닝 파라미터 & "MCTS 깊이" 정정

> **정정**: KataGo에는 **고정 MCTS depth 노브가 없고**, `maxNodeVisits`도 없음. `maxVisits`/`maxPlayouts`/`maxTime` 중 하나를 cap하면 깊이는 emerges.

### 강도 조절 (사용자 실 목표)

`maxVisits` = README + `gtp_human5k_example.cfg`가 지정하는 **일차 강도 레버**.

```ini
# 최소한의 "10급 상대" 설정 (gtp_example.cfg 기반)
maxVisits = 200                 # 강도 cap. 낮출수록 약함. 5k 예제는 40.
numSearchThreads = 2            # MacBook Air 열 쓰래드 sweet-spot; `katago benchmark`로 확인
# 옵션 — 인간 10급 모방 (v1.15.0+). CLI에 -human-model b18c384nbt-humanv0.bin.gz 필요
humanSLProfile = preaz_10k      # 또는 rank_10k (실제 인간 10급 기보 학습)
humanSLChosenMoveProp = 1.0     # KataGo MCTS 수 대신 인간 수를 둘 확률
```

- 여전히 너무 강하면: `maxVisits` 40-80까지 내리거나 이전 작은 net (`g170e-b10c128`/`b15c192`)로 교체
- 너무 약하면: `maxVisits` 400-1000로 올리거나 `humanSLChosenMovePiklLambda`를 낮춤 (큼=인간적/약함, 작음=강함)

### 분석 관련 노브 (형세 UI 작성 시)

- `reportAnalysisWinratesAs` (`BLACK`/`WHITE`/`SIDETOMOVE`) — 어느 측 관점 승률. ( brief의 `reportAnalysisWinratesBy`는 비실재 이름)
- `wideRootNoise` / `analysisWideRootNoise` (0.04 기본) — root exploration 폭
- `includeOwnership` / `includeOwnershipStdev` / `includePolicy` / `includePVVisits` / `includeNoResultValue` — JSON 옵션 필드
- per-query: `avoidMoves`, `allowMoves` (길이 1만), `rootPolicyTemperature`, `minmoves`
- `kata-set-rules chinese|japanese|korean|aga|tromp-taylor|new-zealand|stone-scoring` — 게임 도중 규칙 변경 가능 → **`final_score`/`final_status_list`(계가) 규칙 의존성**이 크므로 한국 사용자라면 `korean` 추천

### 런타임 튜닝

`kata-set-param KEY VALUE`, `kata-get-param`, `kata-get-params` (JSON), `kata-list-params` — 게임 도중 GTP로 다시 시작 없이 검색 노브 변경.

### 설정 파일 위치

- 리포 템플릿: `cpp/configs/gtp_example.cfg` (정본 ~590 줄), `analysis_example.cfg`, `gtp_human5k_example.cfg`, `gtp_human9d_search_example.cfg`
- macOS Homebrew: `brew list --verbose katago | grep gtp` 위치
- 권장 설치: `default_gtp.cfg` + `default_model.bin.gz`로 이름 지어 바이너리 옆에 두면 GUI에서 `-config`/`-model` 불필요

## 4. 더 약한 엔진 대안 — 10급 매핑

| 엔진 | 라이센스 | 최근 활동 | macOS ARM | 강도 (적정 설정) | GTP 분석? |
|---|---|---|---|---|---|
| **GNU Go 3.8** | GPL-3 | 2009 안정, 2026 brew 병 | ✅ `brew install gnu-go` | **`--level 8` ≈ 10급** (katrain 보정); 1-10 지원 | 승률 그래프 안 됨; `move_probabilities`/worm/dragon 데이터만 |
| **Pachi 12.90** | GPL-2 | 2026-04 안정 릴리스 | ✅ `brew install pachi` (단 메인테이너 "useless dev build" 경고 — dcnn/KataGo fixes 누락; `--nodcnn` 용도는 OK) | `--nodcnn -t =300` ≈ 10급; `-t =5000 --nodcnn` ≈ 3급; dcnn 기본 ≈ 3단 | YES — `lz-genmove_analyze` + `lz-analyze` (히트맵, 승률, 점수) |
| **Leela Zero** | GPL-3 | v0.17 (2019) | ✅ `brew install leilla-zero` | 1 visit여도 ≈ 3-5급 → 항상 너무 강함 | YES (Leela 포맷) |
| **Fuego (mesqueeb 포크)** | LGPL-3 | v1.2.0 Feb 2026 | ✅ native XCFramework | ~3급 싱글 코어; 쿠 급수 핸디캡 어려움 | GTP via `gtpengine` |
| Michi (Python) | MIT | dormant | Python native | ~4급 KGS 9×9 (핸디캡용) | No GTP |
| yssaya/go_mcts_rave | unclear | dormant | C 소스 빌드 | 6급 9×9 @ 10k playouts | 미문서화 |
| Ray (karino2) | Apache-2 | maintained | 소스 빌드 | `--playout`로 가변 | GTP-style |
| MoGo / CrazyStone | **closed** | 유료 앱 전용 | iOS/Android 전용 | CrazyStone DL 무료 17급~2단 | 임베딩 불가 |

### 4(a) 순수-MCTS ~10급 엔진?
**Pachi `--nodcnn`**이 정석 답. yssaya/go_mcts_rave는 연구용, Michi는 Python 실험용. 모두 NN 없는 MCTS 계열. Pachi만 유지보수되는 macOS ARM 바이너리 + falsifiable 10급 보정 데이터 보유.

### 4(b) GNU Go `--level` → 급수 매핑
공식 매핑 없음 (gnugo-devel 2023 미답변). 경험치:
- `--level 8` ≈ 10급 (katrain)
- `--level 10` (기본) ≈ 8급 19×19
- "진짜 보정"을 위해서는 돌 핸디캡이 `--level`보다 더 신뢰함

### 4(c) Pachi 모드 & macOS ARM
- 엔진: `uct`(기본, UCT+RAVE+Moggy+MM 패턴), `dcnn`(정책 전용, 플레이 비권장), `joseki`, `random`
- v12.90 (2026-04)
- ⚠️ brew 공식 패키지는 `caffe`(dcnn + KataGo CPU 빌드)을 누락 — `--nodcnn` 모드엔 영향 없으나 dcnn이 필요하면 소스 빌드 ([homebrew-core#278580](https://github.com/Homebrew/homebrew-core/issues/278580))
- GTP 지원: `lz-analyze 50`, `lz-genmove_analyze B 50`, GoGui live-gfx
- **주의**: Pachi stderr로 로그 출력 → GTP 분석 채널과 섞임. `-o pachi.log` 명시 필수 (Sabaki gotcha)
- **GPL-2** → 폐쇄 앱 정적 링크 불가; `child_process`/GTP (이것이 Sabaki가 이미 하는 방식)로만 연동

### 4(d) "10급이 진지하면 이기는지?"

| 설정 | 10급 현실적 결과 |
|---|---|
| GNU Go `--level 8` | **진지하면 승, 대충하면 패** — 보정된 공정 매치업 |
| GNU Go `--level 10` (기본) | **핸디캡 없이 패** (8급이 ~2 돌 강함) |
| Pachi `--nodcnn -t =300` (보정) | **진지하면 승** |
| Pachi dcnn 기본 (3단) | **항상 패** |
| Leela Zero (40b, 1+ visit) | **항상 패** (≥3급) |
| KataGo `b18c384nbt` + `maxVisits=200` (Human-SL 없음) | **핸디캡 없이 패** — visit-cap 해도 프로급 넷은 10급 제압 |
| KataGo `b18c384nbt-humanv0` + `rank_10k` | **대략 동등** — 실 10급 착수 패턴 모방 |

## 5. badukdojang 코드베이스 통합 지점

탐색자 서브에이전트가 `path:line` 인증으로 매핑.

### 프로젝트 형태

- **순수 웹 SPA** — Preact 10 + Vite 8 + Bun + TypeScript (strict). **Tauri·Electron 없음.** `package.json:15-32`는 Preact+Sabaki 4종+툴링만.
- 디렉토리: `src/`(앱), `public/`(에셋), `e2e/`(Playwright), `docs/`(위키)
- 빌드: `bun run dev` (Vite :5173), `bun run test` (Vitest jsdom), `bun run e2e` (Playwright chromium 1 스펙 12 테스트)

### 엔진 통합 natural chokepoint

- `src/lib/gameState.ts:28` — `createGameState(size, initialTree?)`. 상태 = `{ board: GoBoard, currentPlayer: 1|-1, lastMove, gameTree, ... }`. `makeMove`/`pass`/`undo`/`redo`/`getSignMap`. ko/자살/덮기는 `@sabaki/go-board`가 강제.
- `src/lib/gameTree.ts:155` — `getMoveList(tree)` returns `{ vertex: Vertex | 'pass', sign: 1|-1 }[]` → **엔진이 히스토리 재생에 그대로 기대하는 shape**
- `src/lib/sgfIo.ts:7` — `treeToSGF(tree, size)` — KataGo에 SGF를 한 번에 던지는 통로
- `src/App.tsx:55-69` — `handleVertexClick`: click → `makeMove` → `setSignMap(getSignMap())`. `handleEngineMove(vertex)` 미러 슬롯이 똑같이 동작
- `src/components/ControlBar.tsx:15-31, 147` — `Pass` 옆에 "AI 수"/"힌트" 버튼 추가 자연스러운 위치. 인터페이스 `onEngineMove?: () => void` 신규 prop
- `vite.config.ts:1-7` — **`worker:` 블록 없음**. Web Worker(논블로킹 KataGo JSON 처리 추천) 도입 시 `worker: { format: 'es' }` 추가 필수

### 현재 엔진 코드 zero

`katago|gtp|gnugo|pachi|leela|engine|ai|scoring|score|count|territory` 대소문자 무시 grep — 모든 매치는 Phase-2 문서(`docs/wiki/baduk-mvp.md:148`, `docs/ideas.md:*`), 사운드 인자(`src/lib/sound.ts:63`), UI element count(`scripts/`), 생성된 HTML 보고서. **`src/` 내 `engine/`, `ai/`, `gtp/`, `Worker`, `WebSocket`, `tauri`, `electron` import 없음**.

### 추천 통합 지점 (5)

1. **`src/lib/gameState.ts`** — 보드+트리+turn 소유 chokepoint. 엔진이 `gameState.gameTree`(`getMoveList`)를 읽고 `Vertex`를 돌려주면 기존 `makeMove(vertex)` + `setSignMap(getSignMap())` 파이프라인 그대로 재사용
2. **`src/lib/gameTree.ts`** (+`sgfIo.ts`) — outbound 표면 (`play`/`undo`/SGF-once)
3. **`src/App.tsx`** — `handleVertexClick` 미러로 `handleEngineMove` + "engine thinking" 오버레이 상태
4. **`src/components/ControlBar.tsx`** — "AI 수"/"힌트" 버튼 + 상태 텍스트
5. **신규 `src/lib/engine/`** — `engineBridge.ts`(Worker/fetch/EventSource transport), `katagoAdapter.ts`(`SignMap`+`Player` ⇄ KataGo GTP), `types.ts`(`EngineMoveRequest` 등)

## 6. 통합 플랜 작성 시 해결 필요 7개 의사결정 (보류)

플랜은 사용자가 별도 세션에서 시작할 때만 작성. 아래는 메모:

1. **엔진 선택** — KataGo (5개 기능 단일 바이너리) vs Pachi (플레이 전용) 둘 다? 추천 v1: KataGo only
2. **transport** — (a) Dev 서버 HTTP proxy로 KataGo 감싸기 (b) **Tauri sidecar** (`baduk-mvp.md:149`에 이미 위 roadmap) — 추천 (b)
3. **v1 기능 범위** — 플레이 전용 vs 플레이+분석+계가 전부. 추천: `b18c384nbt` + `katago analysis`로 전부 (단일 모델, 단일 바이너리)
4. **강도 기본** — `maxVisits=200`+Human-SL `rank_10k` vs 고정 `maxVisits=40`. 추천: Human-SL `rank_10k` 추가 모델 부담 vs 단순성 trade-off
5. **규칙 기본** — `chinese` (GUI 표준) vs `korean` (사용자 경험: 타이잼/카트레인 한국어권). 추천: `korean`
6. **네트워크 번들** — 93MB 초기 다운로드 vs 앱 바이너리 포함(MIT이므로 합법) vs 첫 실행 시 자동 프롬프트
7. **GPL 함의** — Pachi GPL-2, GNU Go GPL-3 → 폐쇄 앱 정적 링크 불가; GTP `child_process`만 가능. KataGo는 MIT.

## 참고 자료

**KataGo 정본**
- README — https://github.com/lightvector/KataGo ("Which network" 섹션)
- `docs/GTP_Extensions.md` — https://github.com/lightvector/KataGo/blob/master/docs/GTP_Extensions.md
- `docs/Analysis_Engine.md` — https://github.com/lightvector/KataGo/blob/master/docs/Analysis_Engine.md
- `cpp/configs/gtp_human5k_example.cfg`, `gtp_example.cfg`, `analysis_example.cfg`
- `Compiling.md#macos` — https://github.com/lightvector/KataGo/blob/master/Compiling.md
- 규칙 참조 — https://lightvector.github.io/KataGo/rules.html

**릴리스 & Metal 백엔드**
- v1.15.0 (Human-SL 모델) — https://github.com/lightvector/KataGo/releases/tag/v1.15.0
- v1.16.0 (Metal 병합 2025-04) — https://github.com/lightvector/KataGo/releases/tag/v1.16.0
- v1.16.5 (현재 안정; Metal MacOS 개선) — https://github.com/lightvector/KataGo/releases/tag/v1.16.5
- PR #1148 (Metal hybrid CPU+GPU+ANE) — https://github.com/lightvector/KataGo/pull/1148
- PR #1199 (MLX 백엔드 + M3 Max 벤치마크) — https://github.com/lightvector/KataGo/pull/1199
- Issue #857 (M2 Metal b18 벤치) — https://github.com/lightvector/KataGo/issues/857
- gogospace M1 Air b18 vs b28 — https://gogospace.com/using-katrain-with-a-coreml-katago-on-apple-silicon/

**모델**
- https://katagotraining.org/networks/ · https://katagotraining.org/extra_networks/
- 라이센스 (MIT, CC-BY 아님) — https://katagotraining.org/network_license/
- g170 아카이브 — https://katagoarchive.org/g170/neuralnets/index.html
- TrainingHistory.md — https://github.com/lightvector/KataGo/blob/master/TrainingHistory.md

**약한 엔진**
- Pachi — https://github.com/pasky/pachi · HACKING — https://github.com/pasky/pachi/blob/master/HACKING
- GNU Go — https://www.gnu.org/software/gnugo/ · manual ch.3 — https://www.chiark.greenend.org.uk/doc/gnugo/html/gnugo_3.html
- katrain#44 (10급 보정 곡선) — https://github.com/sanderland/katrain/issues/44
- Leela Zero #871 (1-visit ≈ 3-5급) — https://github.com/leela-zero/leela-zero/issues/871
- mesqueeb/FuegoOnAppleSilicon — https://github.com/mesqueeb/FuegoOnAppleSilicon
- yssaya/go_mcts_rave — https://github.com/yssaya/go_mcts_rave
- pasky/michi — https://github.com/pasky/michi

**Sabaki 스택 (badukdojang과 동일)**
- https://github.com/SabakiHQ/gtp (Node.js 엔진 브릿지 — Sabaki 자체가 사용)
- https://github.com/SabakiHQ/Sabaki/blob/master/docs/guides/engine-analysis-integration.md

**프로젝트 내부**
- `docs/index.md:1-28` — MOC
- `docs/wiki/baduk-mvp.md:145-154` — Phase-2 roadmap
- `docs/ideas.md:13-20` — Inbox 원 요청

## 관련 노트

- [ideas.md](../ideas.md)
- [index.md](../index.md)
- [baduk-mvp](baduk-mvp.md) — Phase-2 roadmap에 KataGo 연동·Tauri·계가 명시
