---
title: 아이디어 및 할일
description: Phase 2 기능 계획 (계가/KataGo/Tauri), 바둑 사진 이어하기 앱, AI 바둑 선생님 아이디어, OMO 실행 로그
tags: [ideas, plans]
created: 2026-07-05
updated: 2026-07-16
---

# 바둑 사이드 프로젝트

## Memo

### Inbox
바둑 엔진을 연동하고 싶어
katago 가 내가 선택할 수 있는 최선일 것 같은데...
엔진 연동 작업을 착수하기 전에 다음 리스트 불릿에 대해 먼저 조사해줄래?
- 카타고 엔진이 어떤 기능을 제공하는지; 다음 수 추천, 승률 예측, 형세 판단, 집 차이 계산, 계가?
- 선택할 수 있는 (다운로드) 카타고 모델에는 어떤것들이 있는지; 인간 아마추어 레벨 모델, 우리 시스템(맥북 에어)에서 빠르게 돌릴만한 모델
- 각 모델을 어떻게 튜닝할 수 있는지; 튜닝 파라미터 (MCTS 깊이?)
- 내가 바둑 아마추어 10급 정도인데, 내 수준에 맞게 MCTS 로만 구현된 바둑 모델이라던지? 아니면 pachi, gnugo 처럼 더 약한 바둑 엔진도 연동해 볼 수 있을지 궁금해.


### 할일
MVP 완료
stage 2
계가, 형세분석
- monte carlo 로 끝까지 둬본 후, 죽은돌 판정
- katago 연동
  - 카타고로 끝까지 둬보기
  - 카타고 형세분석

### 바둑경험
약 1년동안 바둑책 독학
타이잼, katago, katrain, playgo.gg, 스팀 바둑게임 등에 대한 경험
ai 10급정도 이기니까 (열심히 해야 이김, 대충 하면 짐), 내 실력은 15~10급 될듯

앞으로 바둑을 주제로 사이드 프로젝트 하면서 아마추어 1급,1단을 목표로!


### 계획
- 바둑 게임 하다보면 중간에 멈춰야 할때가 많은데 그때마다 이어하기가 불편한것 같아.
현재 바둑판 상태를 사진으로 찍어두고, 이로부터 바둑 이어하기 기능을 제공하는 앱을 만들고 싶어

- 돈벌기: 상용 바둑앱보다 좀 더 나은 UI/UX 바둑앱을 만들어서 인공지능 형세분석, 다음수 추천 기능으로 수익낼 수 있지 않을까?

- 연구: 아마추어에게 급수별 맞춤 설명을 해줄 수 있는 인공지능 바둑 선생님을 만들기 위한 연구

### OMO
#### 20260705
/start-work
> The baduk-mvp plan is fully complete. The boulder state confirms:
> - Status: completed
> - Total elapsed: 45m 23s
> - All 12 tasks: Done and verified
> - Final wave: F1 APPROVE | F2 APPROVE | F3 APPROVE | F4 APPROVE
> No further work remains on this plan. If you'd like to start a new plan or continue with phase 2 features (AI integration, desktop wrapper, scoring, etc.), let me know and I'll set up a new work session.
