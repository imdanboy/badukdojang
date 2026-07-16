---
title: 바둑 MVP 완성
description: 9x9/13x13/19x19 바둑판 MVP: Sabaki 라이브러리 연동, SGF 입출력, Undo/Redo, 기술 스택, Wave 작업 흐름, Phase 2 로드맵
tags: [mvp, sabaki, feat]
created: 2026-07-05
updated: 2026-07-05
---

# 🎉 baduk-mvp 완성 기념 노트

> **작성일**: 2026-07-05
> **총 작업 시간**: 약 45분
> **플랜**: `baduk-mvp` (Prometheus 계획 → Atlas 실행 → Sisyphus 검증)

---

## 1. 우리가 뭘 만들었나요?

바로 **클릭해서 바둑을 둘 수 있는 웹 바둑판**입니다.

### 할 수 있는 것들
- **9×9, 13×13, 19×19** 바둑판 선택
- **클릭하면 바둑돌**이 자동으로 번갈아가며 놓입니다 (흑 → 백 → 흑 → 백)
- **잡기 규칙**이 자동으로 적용: 집이 0개인 돌은 자동으로 제거됨
- **패 규칙**: 바로 직전에 잡힌 돌을 다시 잡는 행동은 불가능
- **무르기 / 다시하기**: `Undo`, `Redo` 버튼으로 수를 되돌릴 수 있음
- **한수 쉬기**: `Pass` 버튼으로 차례를 넘길 수 있음
- **좌표 표시**: `Coordinates` 체크박스로 좌표 라벨 켜고 끄기
- **SGF 저장**: `Save SGF` 버튼으로 기보 파일 다운로드
- **SGF 불러오기**: `Load SGF` 버튼으로 기보 파일 불러오기
- **새 게임**: `New Game`으로 판 초기화

### 화면 구성
- 위쪽에 **컨트롤 바** (흑/백 차례 표시, Move 카운트, 보드 크기, 버튼들)
- 아래쪽에 **바둑판** (나무 판에 격자선, 화점, 좌표, 돌)

---

## 2. 기술적으로 어떻게 만들었나요?

### 사용한 도구들
| 도구 | 역할 | 선택 이유 |
|------|------|-----------|
| **Bun** | 자바스크립트 실행기 | npm보다 10배 빠른 패키지 설치, 빠른 테스트 |
| **Vite** | 빌드 도구 | 개발 서버가 순식간에 뜸 (localhost:5173) |
| **Preact** | UI 라이브러리 | React와 호환되지만 3KB로 초경량 |
| **TypeScript** | 타입 시스템 | 버그를 미리 잡아주는 엄격한 언어 |
| **@sabaki/shudan** | 바둑판 렌더링 | 실제 바둑 프로그램 Sabaki가 쓰는 공식 라이브러리 |
| **@sabaki/go-board** | 바둑 규칙 엔진 | 잡기, 패, 자살, 오버라이트 방지를 자동 처리 |
| **@sabaki/immutable-gametree** | 기보(수순) 저장 | Undo/Redo, 가지치기(Branch) 지원 |
| **@sabaki/sgf** | SGF 파일 입출력 | FF[4] 표준 기보 형식 |

### 작업 흐름 (Wave 방식)
OMO는 작업을 **물결(Wave)** 단위로 쪼개서 병렬로 진행합니다:

```
Wave 1: 프로젝트 뼈대 (T1)
Wave 2: 바둑판 보여주기 (T2)
Wave 3: 바둑 규칙 연동 (T3)
Wave 4: 무르기/다시하기 (T4)
Wave 5: SGF 저장/불러오기 (T5)
Wave 6: UI 컨트롤 바 (T6) + 단위 테스트 (T7) ← 병렬로!
Wave 7: E2E 테스트 (T8)
Wave 8: 최종 검증 (F1~F4)
```

각 Wave는 이전 Wave에 의존하지 않는 한 병렬로 처리돼서 시간을 절약합니다.

---

## 3. 프로그램 실행 방법

### 한 번만 필요한 준비
```bash
cd /Users/jinbei/Projects/baduk/badukdojang
bun install          # 의존성 설치 (처음 1회)
```

### 개발 서버 실행 (실제로 둘 수 있는 상태)
```bash
bun run dev          # http://localhost:5173 에서 확인
```

### 테스트 실행
```bash
bun run test:run     # 60개 단위 테스트 (1초 이내)
bun run e2e          # 12개 브라우저 테스트 (6초 이내)
```

### 빌드 (배포용 파일 만들기)
```bash
bun run build        # dist/ 폴더에 배포 파일 생성
```

---

## 4. 파일 구조 (핵심만)

```
badukdojang/
├── src/
│   ├── App.tsx                 ← 메인 화면 (컨트롤 바 + 바둑판)
│   ├── components/
│   │   ├── Board.tsx           ← 바둑판 렌더링 (ResizeObserver, Shudan)
│   │   └── ControlBar.tsx      ← 버튼 바 (10개 컨트롤)
│   └── lib/
│       ├── gameState.ts        ← 현재 게임 상태 (규칙 엔진)
│       ├── gameTree.ts         ← 수순 기록 (Undo/Redo)
│       └── sgfIo.ts            ← SGF 파일 입출력
├── e2e/
│   ├── board.spec.ts           ← 12개 브라우저 자동 테스트
│   └── fixtures/
│       └── test-game.sgf      ← 테스트용 5수 기보
├── playwright.config.ts      ← E2E 설정
└── package.json
```

---

## 5. OMO 워크플로우란?

이번 작업은 **세 단계**로 진행됐어요:

### ① Prometheus (계획 수립)
- `.omo/plans/baduk-mvp.md` 파일에 **Wave별로 상세 작업 목록**을 작성
- 무엇을 만들지, 어떤 라이브러리를 쓸지, 어떤 테스트가 필요한지 모두 기술
- "이건 하지 마", "이건 Phase 2로 미뤄" 같은 **경계(Guardrail)** 도 설정

### ② Atlas (실행)
- `start-work` 명령으로 계획을 읽고 한 Task씩 실행
- 각 Task는 **Sisyphus-Junior**라는 전문 에이전트가 처리
- 병렬로 처리할 수 있는 건 동시에, 순서가 필요한 건 기다리며 실행

### ③ Sisyphus (검증)
- 에이전트가 "다 했어요"라고 하면 절대 믿지 않음
- 직접 코드를 읽고, 테스트를 돌리고, 실제로 브라우저를 켜서 확인
- 검증이 끝나야 진짜 "완료"로 체크

### ④ Boulder (상태 관리)
- `.omo/boulder.json`에 진행 상황이 자동으로 기록
- 몇 개 중 몇 개가 완료됐는지, 어떤 에이전트가 뭘 했는지 추적

---

## 6. Phase 2 에서 할 수 있는 것들

이번 MVP에는 **의도적으로 넣지 않은** 기능들이에요:
- 🤖 AI 대국 (KataGo 연동)
- 💻 데스크톱 앱 포장 (Tauri로 .dmg/.exe)
- ⏱️ 시간 제한 (초읽기)
- 🎯 점수 계산 (계가)
- 📝 바둑 사진 → 바둑판 복원

이 중에서 다음에 어떤 걸 먼저 만들고 싶은지 생각해보세요!

---

## 7. 기록된 증거 파일들

모든 작업의 결과물과 검증 기록은 `.omo/evidence/`에 있어요:
- `task-1~8-*.png` — 스크린샷 증거
- `task-3~5-*-test.txt` — 테스트 통과 기록
- `task-8-*-e2e-*.png` — E2E 테스트 화면
- `f1~f4-*.txt` — 최종 검증 보고서

---

**끝!** 바둑 프로그램을 `bun run dev`로 실행해서 직접 두어보세요. 🎊
