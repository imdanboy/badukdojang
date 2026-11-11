---
title: badukdojang 코드베이스 지도
description: 앱 진입점, 게임 상태·SGF·KataGo·스크린샷 흐름, 주요 파일과 테스트 위치를 안내하는 에이전트용 지도.
tags: [codebase, architecture, map]
created: 2026-11-11
updated: 2026-11-11
---

# badukdojang 코드베이스 지도

> 코딩 에이전트가 기능 구현 전에 관련 파일과 테스트를 빠르게 찾도록 돕는 현재 코드 지도다. 경로와 동작은 코드를 기준으로 확인하고, 이 노트만으로 세부 구현을 단정하지 않는다.

**마지막 코드 확인: 2026-11-11.** 이 문서는 파일 지도를 제공한다. 설정·실행 절차는 [설치 및 사용법](../wiki/setup-and-usage.md), 엔진 튜닝 배경은 [KataGo 난이도 노브](../wiki/katago-difficulty-knobs.md)를 참고한다.

## 빠른 진입

| 작업 | 먼저 볼 파일 |
| --- | --- |
| 화면·게임 흐름 조정 | `src/App.tsx` — 화면 조합과 게임 생명주기 상태/핸들러 |
| 바둑판 규칙·수순·분기 탐색 | `src/lib/gameState.ts`, `src/lib/gameTree.ts` |
| 화면 컴포넌트 변경 | `src/components/` — 기능별 UI. 조립과 상태 연결은 `App.tsx` |
| 엔진 설정·시작/재시작 | `src/hooks/useEngine.ts`, `src/lib/engineSettings.ts` |
| KataGo 요청·GTP 처리 | `src/lib/engine/katagoAdapter.ts` → `src/server/gtp-bridge.ts` |
| 현 위치 분석 / 전체 트리 분석 | `src/hooks/useAnalysis.ts`, `src/hooks/useTreeAnalysis.ts` |
| SGF 입출력·분석 첨부 | `src/lib/sgfIo.ts`, `src/lib/analysisSgf.ts` |
| 스크린샷 이어하기 | `src/components/ScreenshotImportModal.tsx`, `src/lib/screenshotRecognition.ts`, 이후 `App.tsx`에서 SGF를 게임 상태로 교체 |
| 점수 계산 / 복구 저장 | `src/hooks/useScoring.ts`, `src/lib/scoring.ts`; `src/lib/autosave.ts` |

## 저장소 구조

- `src/main.tsx` — React 앱 마운트 지점.
- `src/App.tsx` — 보드·도구막대·사이드바·모달·하단 독을 조립하고, 게임 흐름 및 기능 훅을 연결한다. 세부 UI 상태도 일부 보유하므로 새 로직을 추가하기 전에 기존 책임을 확인한다.
- `src/components/` — 화면 단위 React 컴포넌트와 일부 컴포넌트 테스트.
- `src/hooks/` — React 수명주기가 필요한 엔진·분석·계가 기능.
- `src/lib/` — 게임 트리/상태, SGF, 점수, 설정, 이미지 처리 등 UI 비의존 로직. 관련 `*.test.ts`가 같은 영역에 있다.
- `src/lib/engine/` — 엔진 어댑터와 타입.
- `src/server/gtp-bridge.ts` — Bun HTTP 서버와 KataGo GTP/analysis 프로세스 연결. `src/server/gtp-bridge.test.ts`가 서버 측 테스트다.
- `e2e/` — Playwright 사용자 흐름 테스트.
- `docs/wiki/` — 설치/사용, 설계·조사 및 기능별 구현 기록. 세부 문서는 이 목차에서 찾아간다.

## 핵심 흐름

### 게임 상태와 기보

1. `App.tsx`는 `createGameState()`로 `GameState`를 만들고 현재 트리·모드·보드 표시 상태를 연결한다.
2. `gameState.ts`는 `GoBoard`와 현재 사용자 차례/마지막 착수를 관리하면서 불변 업데이트 형태의 트리 함수를 호출한다.
3. `gameTree.ts`는 Kaya `GameTree`를 감싸 착수(B/W), 셋업(AB/AW), 패스, undo/redo, 분기 이동과 현재 경로 재생을 제공한다.
4. `sgfIo.ts`가 SGF 파싱·직렬화를 맡는다. `autosave.ts`는 현재 대국 복구용 단일 초안을 localStorage에 저장하며, 대국 기록 보관 기능은 아니다.

### KataGo와 분석

1. `useEngine.ts`가 엔진 설정을 로드하고 상태 확인·초기화·설정 동기화를 수행한다. 순수 설정/난이도 매핑은 `engineSettings.ts`에 있다.
2. `katagoAdapter.ts`는 `/api/gtp/*` 요청을 만들고 게임 트리를 엔진에 재생 가능한 수순으로 바꾼다.
3. `src/server/gtp-bridge.ts`가 HTTP 요청을 받아 GTP 명령 또는 별도 KataGo analysis 프로세스에 전달한다. 실행 환경 설정은 `config/engine.json`과 환경 변수에 의존하므로 세부 사항은 설치 문서를 확인한다.
4. `useAnalysis.ts`는 표시 중인 현재 위치를 분석하고, `useTreeAnalysis.ts`는 트리의 여러 위치를 순차 분석한다. 두 흐름은 노드 ID 기반 캐시를 공유한다.
5. 분석 직렬화는 `analysisSgf.ts`의 `KA`(위치별 결과), `KAM`(분석 출처 메타데이터) 형식을 사용하고, SGF 입출력은 `sgfIo.ts`에 연결된다.

### 스크린샷 이어하기

1. `ScreenshotImportModal.tsx`에서 이미지를 읽고 자동 또는 수동 보정 흐름을 제공한다.
2. 순수 인식 로직 `screenshotRecognition.ts`가 격자와 돌을 인식해 setup SGF를 만든다.
3. `App.tsx`가 `PL` 차례 정보를 반영해 SGF 트리를 만들고 현재 대국을 교체한다.
4. 셋업 돌은 SGF의 AB/AW로 보존된다. 게임판 재생은 `gameTree.ts`, 엔진 수순 변환은 `katagoAdapter.ts`를 함께 확인한다.

구현 결정과 이전 이력은 [스크린샷 이어하기 기록](../wiki/screenshot-continue.md)에 정리되어 있다. 세부 알고리즘을 바꿀 때는 이 기록과 현재 구현을 구분해서 읽는다.

## 테스트 찾기

- 라이브러리/훅/컴포넌트: 변경한 모듈의 인접 `*.test.ts(x)`를 먼저 찾는다. 공통 테스트 초기화는 `src/test-setup.ts`, Vitest 설정은 `vitest.config.ts`.
- 서버 브리지: `src/server/gtp-bridge.test.ts`.
- 사용자 흐름: `e2e/*.spec.ts`, 설정은 `playwright.config.ts`.
- 명령어는 `package.json` 기준 `bun run test:run`, `bun run typecheck`, `bun run build`, `bun run e2e`다. 로컬 엔진·브라우저 등 사전 조건이 필요한지 실행 전에 확인한다.

## 기능 히스토리와 갱신 규칙

- 유의미한 기능 기록은 해당 기능 문서에 날짜별로 요약한다. 예를 들어 스크린샷 인식의 구현 결정은 [screenshot-continue](../wiki/screenshot-continue.md), KataGo 설정의 의도는 [katago-difficulty-knobs](../wiki/katago-difficulty-knobs.md)에 있다.
- 코딩 작업 중 동작·구조·핵심 경로가 바뀌면 관련 노트가 여전히 맞는지 확인한다. 영향이 있을 때만 함께 수정하고, 목차에 노트를 추가/삭제/이름 변경했을 때 `docs/index.md`도 고친다.
- 현행 설명에는 코드에서 직접 확인한 내용만 쓴다. 추론은 추론으로 표시하고, 동작이 바뀐 과거 설명은 지우지 말고 날짜가 있는 히스토리로 남긴다.
- 노트 작성 시 전체 코드를 장황하게 복제하지 않는다. 빠른 파일 탐색에 필요한 경로와 역할, 핵심 데이터 흐름, 검증할 테스트를 우선한다.

## 관련 노트

- [위키 목차](../index.md)
- [설치 및 사용법](../wiki/setup-and-usage.md)
- [스크린샷 이어하기 구현 기록](../wiki/screenshot-continue.md)
- [KataGo 난이도 노브](../wiki/katago-difficulty-knobs.md)
