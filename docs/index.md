---
title: badukdojang 위키
description: 프로젝트 위키 진입점 (MOC). wiki/ 영속 노트와 ideas.md 로 라우팅.
tags: [moc, index]
created: 2026-07-16
updated: 2026-07-16
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

## 바로가기
- [ideas.md](ideas.md) — 아이디어, 할일, 메모

## Wiki — 영속 레퍼런스
- [baduk-mvp](wiki/baduk-mvp.md) — 9x9/13x13/19x19 바둑판 MVP: Sabaki 라이브러리 연동, SGF 입출력, Undo/Redo, 기술 스택, Wave 작업 흐름, Phase 2 로드맵
- [token-usage](wiki/token-usage.md) — baduk-mvp 개발 LLM 토큰 소모량 추적: 계획 3.08M vs 실행 0.56M, 캐시 히트율 56%→96%, 작업별 추정 분배
