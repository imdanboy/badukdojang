---
title: 아이디어 및 할일
description: Phase 2 기능 계획 (계가/KataGo/Tauri), 바둑 사진 이어하기 앱, AI 바둑 선생님 아이디어, OMO 실행 로그
tags: [ideas, plans]
created: 2026-07-05
updated: 2026-07-16
---

# 바둑 사이드 프로젝트

## Memo

- 바둑 종반에 아래 에러 발생
Chrome의 연결 및 로드 오류 해결하기

### Inbox
목표: 카타고를 연동해서 AI 와 대국하는 기능을 추가하고 싶어.
지금처럼 1) 놓아보기 2) AI 대국하기
카타고가 제공하는 형세분석, 집차이, 승률, 다음 수 추천 등을 연동해줘.
AI 와 대국하면서 초읽기는 지금 고려하지 않을께, 다만 카타고의 생각시간은 내가 제한할 수 있는 AI 엔진 설정 창이 따로 제공되었으면 좋겠어.
예를들어서, 카타고가 약 5초만 생각하고 다음 수를 착수하도록.

그리고 일단은 카타고 약한 버전을 (10급) 기본 엔진으로 설정해두되, 나중에 카타고가 제공하는 여러 모델 및 pachi, gnugo 모델을 선택할 수 있게 할 예정이야.
사용자가 난이도 별로 모델을 선택해서 대국할 수 있도록

혹시 구현하면서 참고할만한 코드베이스가 필요하면 이미 내가 로컬에 클로닝 해둔 다음 프로젝트를 참고해도 좋아
- [katrain](/Users/jinbei/Projects/baduk/katrain)
- [katagui](/Users/jinbei/Projects/baduk/katagui)

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
