---
title: KataGo AI Integration — 실행 보고서
description: Phase-2 엔진 통합 완료 보고: AI 대국, 형세분석, 계가, 설정패널. 토큰 7.38M, 15개 todo, 48 E2E pass.
tags: [katago, engines, report, token-usage]
created: 2026-07-18
updated: 2026-07-18
---

# KataGo AI Integration — 실행 보고서

> `.omo/plans/katago-ai-integration.md` 플랜의 5개 Wave, 15개 todo 전부 완료. 최종 검증 통과.

## 세션 개요

| 항목 | 값 |
|---|---|
| 플랜 파일 | `.omo/plans/katago-ai-integration.md` |
| Boulder 상태 | completed |
| 총 todo | 15개 (Wave 1:5, Wave 2:4, Wave 3:4, Wave 4:3) |
| 최종 검증 | F1-F4 전부 APPROVE |

## 구현 기능 요약

| # | 기능 | 핵심 파일 | 상태 |
|---|---|---|---|
| 1 | Bun HTTP bridge server | `src/server/gtp-bridge.ts` | ✅ |
| 2 | Vite dev proxy + `start:engine` | `vite.config.ts`, `package.json` | ✅ |
| 3 | 엔진 타입 정의 (282개 Human-SL 프로파일) | `src/lib/engine/types.ts` | ✅ |
| 4 | KataGo HTTP adapter | `src/lib/engine/katagoAdapter.ts` | ✅ |
| 5 | 엔진 설정 패널 | `src/components/EngineSettings.tsx` | ✅ |
| 6 | AI 대국 모드 토글 | `src/App.tsx`, `ControlBar.tsx` | ✅ |
| 7 | `genmove` 통합 + AI 수 검증 | `src/App.tsx` | ✅ |
| 8 | 생각 중 고스트 스톤 + 플래시 | `src/components/Board.tsx`, `index.css` | ✅ |
| 9 | 승률 바 디스플레이 | `src/components/AnalysisPanel.tsx` | ✅ |
| 10 | 집 차이 (scoreLead) | `src/components/AnalysisPanel.tsx` | ✅ |
| 11 | Ownership 히트맵 | `src/lib/ownership.ts`, `Board.tsx` | ✅ |
| 12 | 다음 수 추천 마커 (A/B/C) | `src/components/CandidateMoves.tsx` | ✅ |
| 13 | 종국 계가 모달 | `src/components/ScoringModal.tsx`, `src/lib/scoring.ts` | ✅ |
| 14 | 설정 패널 ↔ 실시간 엔진 튜닝 | `src/App.tsx` (hot-tune effects) | ✅ |
| 15 | 엔진 에러 복구 | `src/server/gtp-bridge.ts`, `src/App.tsx` | ✅ |

## 아키텍처 결정

| 결정 | 선택 | 근거 |
|---|---|---|
| Transport | Bun HTTP bridge (`katago gtp` spawn + HTTP proxy) | 브라우저는 직접 프로세스 spawn 불가; katagui 패턴 차용 |
| 분석 엔진 | `katago analysis` JSON (async streaming) | ownership, scoreLead, winrate, bestMoves 한 번에 수집 |
| AI 상대 | Human-SL `b18c384nbt-humanv0` + `humanSLProfile=rank_10k` + `maxVisits=40` | 실제 인간 10급 기보 모방 (visit-cap만 쓴 pro net보다 인간적) |
| 규칙 | `korean` (area scoring, komi 6.5) | 사용자 경험(타이잼/KaTrain)에 맞춤 |
| SPA 유지 | Pure web (Tauri 제외) | Tauri는 Phase-2 로드맵(`baduk-mvp.md:149`)에 유지 |

## 검증 결과

| 검증 | 결과 |
|---|---|
| Unit tests | **200 passed** |
| Type check (`tsc --noEmit`) | **0 errors** |
| Production build (`vite build`) | **✓** (683KB JS, 13KB CSS) |
| E2E tests | **48 passed, 0 failed** |
| E2E duration | 36.4s |

## 토큰 사용량 (이번 세션)

| 구분 | 토큰 |
|---|---|
| **총 입력** | **6,542,069** |
| **총 출력** | **839,176** |
| **합계** | **7,381,245** |
| 캐시 히트율 | 95.1% |
| 추론 토큰 | 203 |
| 서브 세션 수 | 29개 |

### 모델별 분포

| 모델 | 입력 | 출력 | 합계 | 비중 |
|---|---|---|---|---|
| opencode-go/kimi-k2.6 | 3,115,934 | 520,140 | 3,636,074 | 49.3% |
| opencode-go/glm-5.1 | 2,125,601 | 142,705 | 2,268,306 | 30.7% |
| opencode-go/minimax-m3 | 1,300,534 | 176,331 | 1,476,865 | 20.0% |

### 에이전트별 분포

| 에이전트 | 토큰 | 메시지 | 비중 |
|---|---|---|---|
| Sisyphus-Junior (구현) | 4,607,742 | 1,198 | 62.4% |
| Sisyphus - ultraworker | 1,150,177 | 58 | 15.6% |
| Prometheus - Plan Builder | 627,111 | 11 | 8.5% |
| librarian (외부 문서 조사) | 638,371 | 32 | 8.6% |
| explore (코드베이스 탐색) | 314,875 | 33 | 4.3% |
| multimodal-looker | 42,969 | 12 | 0.6% |

### 도구 사용량 Top 10

| 도구 | 호출 | 비중 |
|---|---|---|
| `read` | 515 | 29.2% |
| `bash` | 465 | 26.3% |
| `edit` | 349 | 19.8% |
| `todowrite` | 93 | 5.3% |
| `grep` | 87 | 4.9% |
| `glob` | 64 | 3.6% |
| `write` | 44 | 2.5% |
| `webfetch` | 40 | 2.3% |
| `websearch_web_search_exa` | 31 | 1.8% |
| `task` | 25 | 1.4% |

## 프로젝트 전체 누적 토큰 (7일)

| 날짜 | 토큰 | 세션 |
|---|---|---|
| 2026-07-16 | 434,597 | 7 |
| 2026-07-17 | 159,350 | 1 |
| 2026-07-18 | **7,381,245** | **42** |

## 제외된 항목 (Must NOT have — 모두 준수)

- 초읽기 (byoyomi) ❌
- 다중 엔진 선택기 (Pachi/GNU Go v1) ❌
- Tauri/Electron 래퍼 ❌
- 자동 모델 다운로드 ❌
- `as any` / empty catch / `@ts-ignore` ❌

## 관련 노트

- [katago-engines](katago-engines.md) — 사전 연구 노트 (기능/모델/튜닝/약 엔진 비교)
- [baduk-mvp](baduk-mvp.md) — Phase-2 로드맵 (Tauri, 계가, AI 연동)
- [token-usage](token-usage.md) — MVP 개발 토큰 추적
- [ideas.md](../ideas.md) — 원 요청 Inbox (L13-34)

## 후속 작업 (미래 Phase)

- Tauri 데스크톱 앱 포장 (`baduk-mvp.md:149`)
- 다중 엔진 선택기 (Pachi, GNU Go)
- Human-SL 외 추가 모델 자동 다운로드
- 온라인 대국 (멀티플레이어)
- AI 강사 모드 (변화도 설명 + 언어 코멘터리)