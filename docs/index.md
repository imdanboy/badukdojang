---
title: badukdojang 위키
description: 프로젝트 위키 진입점 (MOC). 바로가기(현행)와 archive(과거/완료)로 라우팅.
tags: [moc, index]
created: 2026-07-16
updated: 2026-09-13 (Wiki 첫 레퍼런스 — katago-difficulty-knobs 추가)
---

# badukdojang 위키

사이드 프로젝트 지식 + 결정 기록.
**진입점은 이 파일.** 각 노트의 한 줄 설명을 모아두어
LLM 이 어떤 노트를 읽을지 토큰을 거의 안 쓰고 결정할 수 있게 한다.

## 사용 규칙

1. 모든 노트는 `docs/_TEMPLATE.md` 의 frontmatter 를 따른다.
   - `description` 은 ~80자 한 줄. LLM 이 본문을 안 읽고도 이걸로 read 판단.
   - 파일명은 kebab-case.
2. 새 아이디어/메모는 `ideas.md` 에 자유롭게 추가하고, 주기적으로 `wiki/` 노트로 승격.
3. 새 노트 추가/이름 변경 시에만 `index.md` 갱신.
4. **섹션 기준 = 용도/빈도** (위치 아님).
   - **바로가기** — 즉시·반복 조회 (메모함, 외부 폴더 진입, 설치·실행·튜닝 사용법).
   - **Wiki** — 영속 지식·의사결정·레퍼런스.
   - **Archive** — 완료된 보고·과거 아키텍처·히스토리. 맥락 이해용이지 현행 가이드 아님.

## 바로가기
- [ideas.md](ideas.md) — 아이디어, 할일, 메모
- [`self-study/`](../self-study/README.md) — 독립 하위 프로젝트: 알파고 논문 literate-programming 학습 (Quarto + Python). wiki 규칙 밖, README 통해서만 진입.
- [setup-and-usage](wiki/setup-and-usage.md) — 클론부터 KataGo bridge 실행, dev 서버, 빌드, 테스트까지 전체 사용법
- [katago-engines](wiki/katago-engines.md) — KataGo 기능/모델/튜닝 + 약 엔진(Pachi/GNU Go) 비교, 설정 패널·디버깅 체크리스트

## Wiki
- [katago-difficulty-knobs](wiki/katago-difficulty-knobs.md) — KataGo 난이도/강도 파라미터 전체 사전 — 탐색 예산·Human-SL·탐색 왜곡·온도 4층위로 정리

## Archive — 과거/완료 기록
- [baduk-mvp](archive/baduk-mvp.md) — 2026-07-05 MVP 완성 노트. @sabaki/Preact 시절. 실행법은 setup-and-usage로 이전됨
- [badukdojang-migration](archive/badukdojang-migration.md) — MVP → React 19 + @kaya/* 이전 완료 기록 (1-4·6단계 완료, 5단계 다중 엔진은 미완→ ideas로 이관)
- [katago-ai-integration-report](archive/katago-ai-integration-report.md) — Phase-2 AI 통합 완료 보고 (15 todo, 48 E2E pass, 7.38M 토큰)
- [token-usage](archive/token-usage.md) — baduk-mvp 개발 토큰 추적 (계획 3.08M vs 실행 0.56M, 캐시 56%→96%)
- [board-theming-plan](archive/board-theming-plan.md) — @sabaki/shudan용 3테마 계획. Kaya themes 통합으로 대체됨