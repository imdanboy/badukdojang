---
title: badukdojang 위키
description: 내 노트, 코드베이스 가이드, Archive 세 갈래로 라우팅하는 프로젝트 위키 목차.
tags: [moc, index]
created: 2026-07-16
updated: 2026-11-11 (내 노트 / 코드베이스 가이드 / Archive 3분류로 재구성)
---

# badukdojang 위키

사이드 프로젝트 아이디어, 코드베이스 가이드, 결정·히스토리 기록.
**진입점은 이 파일.** 각 노트의 한 줄 설명을 모아두어
LLM 이 어떤 노트를 읽을지 토큰을 거의 안 쓰고 결정할 수 있게 한다.

## 사용 규칙

1. 모든 노트는 `docs/_TEMPLATE.md` 의 frontmatter 를 따른다.
   - `description` 은 ~80자 한 줄. LLM 이 본문을 안 읽고도 이걸로 read 판단.
   - 파일명은 kebab-case.
2. **내 노트**에는 아이디어·할 일뿐 아니라 개인 학습/자료조사와 사람이 참고할 사용법을 둔다.
   아이디어가 구현되면 코드베이스 가이드나 기능 기록에 반영하고, 필요하면 상호 링크한다.
3. **코드베이스 가이드**는 코딩 에이전트가 코드 변경에 활용하는 문서다. 저장소 안의 파일 위치·현재 동작·데이터 흐름·테스트·구현 이력을 실제 코드와 대조해 기록한다.
4. 새 노트 추가·삭제·이름 변경 시 `index.md` 갱신한다. 기존 노트의 범위나 설명이 달라지면 목차 설명도 동기화한다. 노트 본문은 꼭 필요한 경우에만 읽는다.
5. **Archive**는 현행 안내가 아닌 완료·폐기된 계획과 과거 기록을 둔다. 대체 문서가 있으면 링크하고, 현행 가이드처럼 인용하지 않는다.
6. 분류는 소유자/수명주기 기준이다. 자주 보는 문서는 별도 분류를 만들지 말고 해당 항목을 바로가기 링크로 노출한다.

## 1. 내 노트 — 아이디어·공부·사용 참고
- [ideas.md](ideas.md) — 아이디어, 할 일, 장기 방향, 참고 코드베이스
- [`self-study/`](../self-study/README.md) — 독립 학습 프로젝트: 알파고 논문 literate-programming (Quarto + Python). README 통해서만 진입.
- [setup-and-usage](wiki/setup-and-usage.md) — 클론부터 KataGo bridge, 개발 서버, 빌드, 테스트까지 실행 가이드
- [katago-engines](wiki/katago-engines.md) — KataGo 엔진/모델 사용법, 튜닝 참고와 디버깅 체크리스트
- [katago-difficulty-knobs](wiki/katago-difficulty-knobs.md) — KataGo 난이도 파라미터 학습·참고 노트와 badukdojang 매핑 결정
- [kaya-board-recognition](wiki/kaya-board-recognition.md) — kaya의 사진 인식 구조·Moku 개발 조사와 이식 참고
- [board-recognition-alternatives](wiki/board-recognition-alternatives.md) — 바둑판 인식 대안·데이터셋·라이선스 조사

## 2. 코드베이스 가이드 — 코딩 에이전트 참고
- [codebase-map](codebase/codebase-map.md) — 앱 구조·주요 파일 위치·기능 흐름·테스트 위치와 코드 변경 시 위키 갱신 규칙
- [screenshot-continue](wiki/screenshot-continue.md) — 저장소의 스크린샷 이어하기 구현 이력 — 격자 감지, AB/AW setup, 엔진 재생

## 3. Archive — 과거/완료 기록
- [baduk-mvp](archive/baduk-mvp.md) — 2026-07-05 MVP 완성 노트. @sabaki/Preact 시절. 실행법은 setup-and-usage로 이전됨
- [badukdojang-migration](archive/badukdojang-migration.md) — MVP → React 19 + @kaya/* 이전 완료 기록 (1-4·6단계 완료, 5단계 다중 엔진은 미완→ ideas로 이관)
- [katago-ai-integration-report](archive/katago-ai-integration-report.md) — Phase-2 AI 통합 완료 보고 (15 todo, 48 E2E pass, 7.38M 토큰)
- [token-usage](archive/token-usage.md) — baduk-mvp 개발 토큰 추적 (계획 3.08M vs 실행 0.56M, 캐시 56%→96%)
- [board-theming-plan](archive/board-theming-plan.md) — @sabaki/shudan용 3테마 계획. Kaya themes 통합으로 대체됨
