---
name: badukdojang-migration
title: 바둑도장 재설계 이전 가이드
description: 설계안 기반 badukdojang MVP → 신규 아키텍처 이전 계획.
tags: [migration, design, architecture]
created: 2026-08-02
updated: 2026-08-03
---

# 바둑도장 재설계 이전 가이드

> [바둑앱 설계안](../../../baduk/docs/wiki/baduk-app-design.md) 기반으로, 현재 MVP 코드베이스를 목표 아키텍처로 이전하기 위한 작업 계획.

---

## 이전 상태

- **완료**: 1~4단계 프레임워크/코어/렌더링/테마 이전, 6단계 E2E 보정.
- **결과**: `bun run typecheck`, `bun run build`, `bun run test:run` 214개 통과, Playwright E2E 48/48 통과.
- **Kaya 수정 사항**: `@kaya/gametree` `navigate()` 루트 노드 `parentId == null` 시 자식으로 오버플로우하는 버그 수정; `@kaya/themes` build 스크립트에 theme asset 복사 추가.
- **Kaya 의존성 관리**: `third_party/kaya` Git Submodule + `patches/kaya/*.patch` + `scripts/setup.sh` 로 자동화. `package.json`의 `@kaya/*`는 `link:` 프로토콜로 전역 Bun registry의 빌드产物를 참조.
- **남은 예정**: 5단계 GTP 브리지 엔진 추상화/다중 엔진 지원(현재 KataGo 전용으로 동작 중).

---

## 현황 vs 목표 요약

| 축 | 현재 (MVP) | 목표 |
|----|-----------|------|
| **코어 로직** | `@sabaki/go-board` | `@kaya/goboard` |
| **게임트리** | `@sabaki/immutable-gametree` | `@kaya/gametree` |
| **SGF** | `@sabaki/sgf` | `@kaya/sgf` |
| **사석 추정** | 없음 (KataGo final_status_list) | `@kaya/deadstones` (Monte Carlo) |
| **렌더링** | `@sabaki/shudan` (DOM + SVG 오버레이) | `@kaya/shudan` (React Canvas) |
| **UI 프레임워크** | Preact 10 | React 19 + TypeScript |
| **AI — 대국** | GTP (KataGo 전용) | GTP (엔진 독립적: GNU Go, Pachi, KataGo 등) |
| **AI — 분석** | KataGo 분석 엔진 (JSON) | KataGo JSON-RPC (동일) |
| **서버** | Bun + `gtp-bridge.ts` | 유지 (설계와 일치) |
| **테마** | 3종 커스텀 (Shinkaya, Walnut, Classic) | Kaya 6종 (Hikaru, Shell&Slate, Yunzi, HappyStones, Kifu, BadukTV) |

---

## 이전 작업 목록

### 1단계: 프레임워크 이전 (Preact → React 19)

**심각도: 치명적** — Kaya 모듈이 React 19를 요구하므로 선행 필수.

| 작업 | 파일 | 비고 |
|------|------|------|
| `@preact/preset-vite` 제거, `@vitejs/plugin-react` 설치 | `vite.config.ts` | |
| `preact`, `preact/hooks` 제거, `react`, `react-dom` 설치 | `package.json` | |
| JSX 팩토리 설정 제거 (`jsxFactory`, `jsxFragmentFactory`) | `tsconfig.app.json` | `"jsx": "react-jsx"` |
| `h()` 호출 → 표준 JSX로 컴포넌트 변환 | 모든 `.tsx` 파일 | |
| `@testing-library/preact` → `@testing-library/react` | 테스트 설정 | |
| Vitest `preact` 플러그인 제거 | `vitest.config.ts` | |

### 2단계: 코어 로직 패키지 교체

**심각도: 중간** — API 표면이 유사해 import 변경 위주.

| 작업 | 파일 | 비고 |
|------|------|------|
| `@sabaki/go-board` → `@kaya/goboard` import 교체 | `gameState.ts` | `analyzeMove()` dry-run API 추가 활용 가능 |
| `@sabaki/immutable-gametree` → `@kaya/gametree` import 교체 | `gameTree.ts` | 거의 API 동일 (직접 TS 포트) |
| `@sabaki/sgf` → `@kaya/sgf` import 교체 | `sgfIo.ts` | 거의 API 동일, 마커 추출 헬퍼 추가 |
| `@kaya/deadstones` 통합 | `scoring.ts` | Monte Carlo 사석 추정으로 `final_status_list` 대체 검토 |

### 3단계: 렌더링 이전 (@sabaki/shudan → @kaya/shudan)

**심각도: 중간** — DOM→Canvas 전환. Goban 컴포넌트 prop 인터페이스는 유사.

| 작업 | 파일 | 비고 |
|------|------|------|
| `@sabaki/shudan` → `@kaya/shudan` import 교체 | `Board.tsx` | |
| `Goban` 컴포넌트 prop 매핑 확인·조정 | `Board.tsx` | `signMap`, `markerMap`, `heatMap`, `ownershipMap` 등 prop 이름 유사 |
| SVG 오버레이 제거, `heatMap`/`ownershipMap` prop 사용 | `Board.tsx`, `ownership.ts` | Kaya `shudan`이 Canvas 내부에서 히트맵·오너십 직접 렌더링 |
| `ownership.ts` 로직 유지, 렌더링만 prop 전달로 전환 | `ownership.ts` | 데이터 계산 로직은 그대로 |

### 4단계: 테마 이전

**심각도: 낮음** — 기능 영향 없음.

| 작업 | 파일 | 비고 |
|------|------|------|
| `shinkaya.css`, `walnut.css`, `classic.css` 제거 | `src/themes/` | |
| Kaya `@kaya/themes` 패키지 및 6종 에셋 통합 | 신규 | `BoardThemeContext` 기반 |
| `BoardThemeProvider`로 테마 전환 UI 추가 | `App.tsx` | |
| `public/themes/` 정적 에셋 정리 | `public/themes/` | |

### 5단계: UI 컴포넌트 React 이전 (1단계와 병행)

**심각도: 낮음** — 문법 변환, 로직 유지.

| 파일 | 설명 |
|------|------|
| `App.tsx` | 핵심 오케스트레이터. Preact → React 문법 변환 |
| `ControlBar.tsx` | 모드 전환, undo/redo, 저장/불러오기 |
| `EngineSettings.tsx` | 엔진 설정 패널 |
| `AnalysisPanel.tsx` | 승률·점수차 표시 |
| `CandidateMoves.tsx` | 상위 3개 추천수 패널 |
| `ScoringModal.tsx` | 계가 결과 모달 |

### 6단계: GTP 브리지 확장 (엔진 독립적)

**심각도: 낮음** — 현재 구조가 이미 GTP 기반.

| 작업 | 파일 | 비고 |
|------|------|------|
| 엔진 타입 추상화 (katago/gnugo/pachi) | `gtp-bridge.ts` | 설정으로 엔진 바이너리 경로·프로토콜 지정 |
| 엔진 선택 UI 추가 | 신규 컴포넌트 | 드롭다운 등 |
| 다중 엔진 동시 연결 지원 (분석 전용) | `gtp-bridge.ts` | KataGo 분석 엔진은 항상 별도 프로세스로 유지 |

---

## 유지 가능한 모듈 (변경 불필요)

| 모듈 | 파일 | 이유 |
|------|------|------|
| **GTP 브리지 서버** | `src/server/gtp-bridge.ts` | GTP + 분석 이중 프로세스 관리, 설계와 완전 일치 |
| **AI 클라이언트 어댑터** | `src/lib/engine/katagoAdapter.ts` | Human-SL/Strong 분기, policy-weighted 샘플링, 오류 추적 |
| **AI 타입 정의** | `src/lib/engine/types.ts` | KataGo GTP·분석 프로토콜 타입 |
| **계가 로직** | `src/lib/scoring.ts` | 영역 계산, GTP 결과 파싱 |
| **사운드** | `src/lib/sound.ts` | Web Audio API 기반 |
| **오너십 데이터** | `src/lib/ownership.ts` | 데이터 계산 로직 유지, 렌더링만 이전 |
| **E2E 테스트** | `e2e/` | Playwright, DOM 셀렉터만 일부 조정 |
| **단위 테스트** | `src/**/*.test.*` | import 경로만 교체 |
| **Vite 설정** | `vite.config.ts` | Preact 플러그인만 React로 교체 |
| **Bun 도구 체인** | `bun.lock`, `scripts/` | |
| **KataGo 설정** | `config/`, `analysis_logs/`, `gtp_logs/` | |

---

## 이전 순서 권장

```
1단계: React 19 이전
  └── package.json, vite.config.ts, tsconfig → React 표준으로
  └── 모든 .tsx 컴포넌트 Preact 문법 → React JSX

2단계: 코어 로직 교체 (+ 2단계 병행 가능)
  └── @sabaki/* → @kaya/* import 교체
  └── 단위 테스트 import 반영

3단계: 렌더링 이전
  └── Board.tsx: @sabaki/shudan → @kaya/shudan
  └── ownership.ts: SVG 오버레이 → heatMap/ownershipMap prop

4단계: 테마 이전
  └── @kaya/themes 통합, 커스텀 CSS 제거

5단계: GTP 브리지 확장
  └── 엔진 추상화, 다중 엔진 지원

6단계: E2E 테스트 보정
  └── DOM 셀렉터, Canvas 대상 Playwright 액션 조정
```

---

## Kaya 의존성 설치

Kaya 저장소는 badukdojang이 직접 관리할 수 없으므로, Git Submodule로 포함하고 필요한 로컬 수정은 patch 파일로 관리합니다.

```bash
# 한 번의 명령으로 submodule 초기화, patch 적용, Kaya 빌드/링크, badukdojang 의존성 설치
bun run setup
```

`bun run setup`은 다음을 수행합니다:

1. `third_party/kaya` 서브모듈 checkout (`git submodule update --init --recursive`)
2. `patches/kaya/*.patch`를 Kaya 작업 디렉터리에 적용
3. Kaya workspace 의존성 설치 (`bun install`)
4. 필요한 Kaya 패키지 빌드: `@kaya/goboard`, `@kaya/sgf`, `@kaya/gametree`, `@kaya/themes`, `@kaya/shudan`
5. `bun link`로 각 패키지를 Bun 전역 registry에 등록
6. badukdojang 의존성 설치 (`bun install`)

이후에는 `bun run dev`, `bun run build`, `bun run test:run`, `bun run e2e` 등이 정상 동작합니다.

> 주의: `bun install`만으로는 `@kaya/*` `link:` 의존성을 해석할 수 없습니다. 반드시 `bun run setup` (또는 `scripts/setup.sh`의 1~5단계 후 `bun install`)을 먼저 실행하세요.
