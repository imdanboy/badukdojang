---
title: 아이디어 및 할일
description: 후속 작업(다중 엔진/Tauri/사진 복원/AI 강사), 장기 방향(수익화/연구), 참고 코드베이스
tags: [ideas, plans]
created: 2026-07-05
updated: 2026-08-09 (archive 정리 후 재작성 — 구 Inbox/할일/OOM/OMO 로그는 달성·이관 완료)
---

# 바둑 사이드 프로젝트 — 아이디어 및 할일

## 바둑 경험
- 약 1년 독학. 타이잼 / KataGo / KaTrain / playgo.gg / 스팀 바둑게임 경험
- AI 10급과 엇비슷 (진지하면 승, 대충하면 패) → 실력 약 15~10급
- 목표: 아마추어 1급·1단

## 후속 작업 (Phase 3 후보)
마이그레이션 5단계 미완 + AI 통합 보고서 후속:
- [ ] **다중 엔진 선택기** — Pachi, GNU Go 지원 (마이그레이션 5단계, 아카이브 [badukdojang-migration](archive/badukdojang-migration.md) 참조)
- [ ] **Tauri 데스크톱 포장** — `.dmg`/`.exe`
- [ ] Human-SL 외 추가 모델 자동 다운로드
- [ ] 온라인 대국 (멀티플레이어)
- [ ] **AI 강사 모드** — 변화도 설명 + 자연어 코멘터리 (급수별 맞춤)

## 장기 방향
- **사진 이어하기** — 바둑판 상태 사진 → 바둑판 복원 앱
- **수익화** — 상용 바둑앱 대비 개선된 UI/UX + 인공지능 형세분석/다음수 추천
- **연구** — 아마추어 급수별 맞춤 설명 AI 바둑 선생님 (→ [`self-study/`](../self-study/README.md) 학습과 연결)

## 참고 코드베이스 (로컬 클론)
- `/Users/jinbei/Projects/baduk/katrain`
- `/Users/jinbei/Projects/baduk/katagui`