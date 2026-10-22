---
title: 스크린샷 이어하기 설계·구현 노트
description: 스크린샷→국면 인식→setup SGF 이어하기 기능의 범위 결정, 기울기 프로파일+RANSAC 알고리즘, AB/AW 통합 구조
tags: [features, board-recognition, screenshot, setup-sgf, sgf]
created: 2026-10-22
updated: 2026-10-22
---

# 스크린샷 이어하기 설계·구현 노트

> INBOX "중단된 대국 스크린샷으로 이어하기" 기능의 범위 결정과 구현 기록.
> playgo.gg 의 Photo Count(계가 전용) 조사에서 출발해 문제 범위를
> **렌더된 스크린샷**으로 좁혔을 때 어떻게 딥러닝 없이 푸는지,
> setup property(AB/AW) 가 기존 시스템(게임 상태·엔진)에 어떻게 통합되는지 다룬다.

## 0. 범위 결정

- **입력을 스크린샷으로 한정** (실물 판 사진 제외). 렌더 판은 원근·조명·가림이
  없고 축정렬 — 도메인 갭이 소멸해 합성 데이터/고전 CV로 상당히 해결 가능.
- playgo.gg "Photo Count" 대비: 그들은 서버 잡+계가 전용(공유 카드), 우리는
  클라이언트 전부+이어하기(이 글의 핵심).
- 결과 표현은 **setup SGF(AB/AW)** — 스크린샷 국면은 법적 수순 재생으로 만들
  수 없어 수 속성이 아니라 setup 이 정답 (kaya 동일 접근, wiki: kaya-board-recognition 3절).

## 1. 인식 알고리즘 (`src/lib/screenshotRecognition.ts`)

kaya 클래식 CV 재사용 + 스크린샷 특화 3조각. kaya 자산: `toGrayscale`,
`classifyIntersections`(적응 k-means), `classifyWithHints`, `buildSGF`.

1. **기울기 에너지 프로파일**: 축별 1차 차분 절대합. 세로선이 판톤↔선톤 전이를
   반복해 G[x] 큼. 배경·UI 가 열 구조를 갖지 않아 오염 없고, 어두운/밝은 선
   극성(테마) 무관.
2. **선 검출**(`findLines`): 좌/우 에지 극값(≤6px) 병합 → NMS(len/120) →
   **depth 하한 = 상위 10 극값 평균 × 15%** (관통 위장 1차 방어).
3. **RANSAC 등차 피팅**: 간격 후보(연속 diff)마다 모든 시작점의 등차 체인을
   walk → LSQ+이상치 기각(b/5) → 점수 = kept × 청결도 × **채움비율(kept/span)**.
   - 돌 에지·텍스트의 위장 간격(한 칸 미만)이 최빈 diff 가 되는 문제를
     "체인 지지도×청결도" 점수로 대체.
   - 체인 로컬 **깊이 일관성**(median의 25%) 필터 — 판 가구 에지가 끼어든
     체인의 웃긴 멤버 제거 후 재정제.
4. **cross-axis 복구**(forceCount): 양축 count 불일치 → 다른 축 count·간격으로
   반대축 재피팅. 실패가 아니라 복구 기회로 설계.
5. **홀수 사전**: 짝수 count 는 판 가구(레이블 밴드)가 한 칸 바깥에 관통한
   신호 → 한 줄 줄여 양축 재피팅 (9/13/19 전부 홀수).
6. 실패 시 **수동 4코� 경로**: 사용자가 최외곽 교차점 4곳 클릭 → 크기 선택.

평가: `bun run scripts/recognition-harness.ts` (PNG 헤드리스 디코더+ASCII 덤프).
~/Desktop/dev-sample 5장: 대국 화면 3장 자동(신뢰도 0.71~0.96), Tygem
사각타일+팝업 블록 / OGS 분석모드(죽은돌 링·차트) 2장은 수동 경로(범위 밖).

## 2. setup property(AB/AW) 통합

인식 결과 자체보다 통합이 더 깊은 변경이었다:

- **`gameTree.ts`**: `getCurrentSignMap` 이 AB/AW 를 적용해야 이어하기 국면이
  화면에 복원된다(root 포함 모든 경로 노드). 부분집합 재생 논증: 최종 국면의
  돌 부분집합을 아무 순서로 놓으면 어떤 그룹도 0활기가 되지 않아 캡처·자살
  없음 — makeMove 가드(off)로 배치 가능.
- **`gameState.ts`**: `PL`(다음 착수자) 지원 — 스크린샷엔 차례 정보가 없어
  사용자 지정(흑/백)을 root `PL` 로 심는다.
- **`katagoAdapter.ts`**: 4곳 분석/AI수/계가/policy 재생 목록이 `getMoveList`
  만 써 setup을 누락 → `getSetupStones`(gameTree.ts)를 착수 재생 앞에 병합
  (`gtpReplayMoves`). 무 이상 재생 — 같은 논증으로 건너뛴 캡처 없음.
- **vite**: `@kaya/board-recognition` 캔 barrel 의 moku(ONNX) dynamic import
  해석 → 25MB ORT WASM 복사. 미사용 도메인이므로 `src/lib/onnxruntime-stub.ts`
  alias 로 제거.

## 3. 파일 맵

- `src/lib/screenshotRecognition.ts` — 알고리즘 전부 (순수 JS, DOM 불필요)
- `src/lib/imageDecode.ts` — File→canvas→RawImage
- `src/components/ScreenshotImportModal.tsx` — 입력(파일/드롭/붙여넣기)·
  자동 실패→수동 4코너·프리뷰+교차점 토글 보정(힌트 재분류)·이어하기(PL 포함)
- `src/lib/gameTree.ts` / `gameState.ts` / `engine/katagoAdapter.ts` — setup 통합
- `scripts/recognition-harness.ts` — 실샘픓 회귀(ASCII 덤프)
- `patches/kaya/board-recognition-sparse-kmeans-init.patch` — kaya kmeans3
  초기화 수정: 백분위(10/50/90) init 은 돌 점유 <10%(포석)에서 클러스터 붕괴 →
  최소/중앙/최대 시드(최상수비 비대칭 대응).

## 4. 남은 것

- 분석모드/계가 중 스크린샷(링 돌·집 음영), Tygem 사각타일은 수동 경로.
  죽은돌 링/음영 인식 개선을 원하면 분류기에 합성 학습(rociiu 방식, MIT) 추가.
- 방향 보정(판이 뒤집힌 스크린샷) 미지원 — 별점 위치로 자동화 가능.
- 놓친 선 40%+ 인 부분판(줌)은 수동 경로 의존.

## 관련 노트

- [kaya-board-recognition](kaya-board-recognition.md) — kaya 파이프라인 정본. 이 기능의 재사용 바탕
- [board-recognition-alternatives](board-recognition-alternatives.md) - 선례·라이센스
- [setup-and-usage](setup-and-usage.md) — 실행·테스트 (harness 포함)
- [index.md](../index.md)
