---
title: 아이디어 및 할일
description: 후속 작업(다중 엔진/Tauri/사진 복원/AI 강사), 장기 방향(수익화/연구), 참고 코드베이스
tags: [ideas, plans]
created: 2026-07-05
updated: 2026-08-09 (archive 정리 후 재작성 — 구 Inbox/할일/OOM/OMO 로그는 달성·이관 완료)
---

# 바둑 사이드 프로젝트 — 아이디어 및 할일

## INBOX

3가지 방향으로 각각 파보고 싶어
1. 화려한 UI/UX 바둑앱을 언젠가 만들기 위해 필요한 기초 Unity 공부
2. 사람에게 적절한 난이도를 가진 바둑 엔진을 만들기 위한 바둑 엔진 실험 환경
3. 나에게 당장 필요한 실용적인 바둑앱 만들기; 중단된 대국 스크린샷으로부터 이어하기(→ 조사완료: [kaya-board-recognition](wiki/kaya-board-recognition.md)), 전략 전술 도움받기 등

### Link
https://github.com/suragnair/alpha-zero-general
https://github.com/online-go/online-go.com

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

## MCTS 참고자료
1. Jeff Bradberry — "Monte Carlo Tree Search: A Tutorial" (GitHub: JeffBradberry/mcts)
- 최고의 코드 레벨 튜토리얼. MCTS를 흐름 따라 한 줄씩 만들며 진행, Tic-Tac-Toe/틱택토부터 그리드월드까지. 알고리즘 각 단계(selection/expansion/simulation/backprop)가 코드 라인과 1:1로 대응돼서 개념과 구현을 동시에 잡기 좋음.
2. suragnair/AlphaZero-General (GitHub)
- 알파고제로 계열 재구현인데 neural_mcts.py, MCTS.py가 깔끔하게 분리돼 있음. "MCTS를 나중에 네트워크랑 붙일 거"라는 네 목표와 구조가 같아서 레퍼런스로 두기 좋음. Tic-Tac-Toe/Connect4/Gomoku 셋 다 실행 가능.
3. Browne et al. — "Monte-Carlo Tree Search: A Survey" (2012) 
- 코드는 아니지만 UCB1 수식과 MCTS 4단계 개념의 정본. 수식에 막힐 때마다 이걸 열어볼 것.
