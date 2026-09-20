---
title: kaya board-recognition (스크린샷 이어하기) 조사
description: kaya의 사진→바둑판 인식(Moku RT-DETR+CV)→setup SGF 병합 이어하기 구조 조사 — Moku 모델 개발/학습데이터 내역 포함
tags: [kaya, board-recognition, moku, features]
created: 2026-09-14
updated: 2026-09-17 (Moku 모델 개발/학습 데이터 조사 추가)
---

# kaya board-recognition (스크린샷 이어하기) 조사

> ideas.md INBOX 3번 "중단된 대국 스크린샷으로부터 이어하기"의 레퍼런스로,
> 로컬 클론 `/Users/jinbei/Projects/baduk/kaya`에서 해당 기능을 어떻게
> 구현했는지(연구) 정본은 kaya 저장소 코드. badukdojang에 동일 기능을
> 이식할 때의 설계 결정 자료로 쓴다.

## 0. 한 줄 요약

kaya는 **클래식 CV 파이프라인(Canny+Hough+homography)과 RT-DETR 데이터모델("Moku AI") 두 백엔드를 병행**하는 `@kaya/board-recognition` 패키지를 갖고 있고, 실제 UI는 사실상 moku(ONNX) 경로만 쓴다. 인식 결과는 **move 없는 setup position(AB/AW, 필요시 AE)** SGF로 변환해 현재 게임에 오버레이 — "이어하기"는 새 게임이 아니라 setup property 병합 방식.

## 1. 파이프라인 (packages/board-recognition)

의존성: `onnxruntime-web ^1.24.3` (WASM EP, numThreads=1 — WebGPU 아님).

### 1(a) 클래식 CV 백엔드 (`recognizeBoard`, index.ts:56)
1. 600px 다운스케일
2. `findBoardCorners` — Canny(`edges.ts:196`) + Hough transform(NMS peak, `hough.ts:20/65/110`) + line intersect. 실패 시 이미지 경계 fallback(`cornersDetected=false` → 수동 보정 UI 필요)
3. `warpPerspective` — 4-point homography(`perspective.ts:44/106`), 800px 정방형
4. `estimateGridInWarped`(corners.ts:138) 격자 추정
5. `classifyIntersections` — 교차점 평균 밝기 임계 분류(`stones.ts:202`, blackThreshold=45/whiteThreshold=30)

재보정 API: `reclassifyWithCorners`(index.ts:122, 코너 드래그 후), `reclassifyWithHints`(index.ts:161, 교차점별 수동 지정). SGF 출력은 `buildSGF(boardSize, stones)`(`sgf.ts:11`) = `GM[1]FF[4]SZ[n]` + `AB`/`AW`.

### 1(b) Moku AI 백엔드 (실제 UI 메인 경로)
- **모델**: RT-DETR ONNX — 리모트 `https://huggingface.co/kaya-go/moku-v3/resolve/main/model.onnx` (`moku-detector.ts:42`), 데스크톱은 bundled `/models/moku-v3.onnx` 우선 → 원격 fallback. 입력 (1,3,640,640), 출력 logits (1,300,3) + pred_boxes (1,300,4). 클래스 3개: **0=흑돌, 1=백돌, 2=바둑판 코너** (`moku-postprocess.ts:22-31`).
- **모델 캐시**: Cache API(`kaya-moku-models`) 영속 + ETag 기반 무효화(24h TTL) (`moku-model-cache.ts:20-28`).
- **코너 추론이 메인 트릭**: 검출된 코너 query(tabular 4-point 인식) — 코너 2개면 대각선/변 해석 후보 3가지 스코어링, 3개면 평행사변형 완성으로 4th 코너 추론 (`moku-postprocess.ts:247-331`) → homography warp → 교차점 스냅(`mapStonesToGrid`).
- **refilter()**: 추론 없이 cached logits만 재-threshold(~0.1ms, `moku-detector.ts:217`) — UI 감도 슬라이더가 ONNX 재실행 없이 즉시 반영됨(임계 0.035, UI 슬라이더는 역수 매핑 1-sensitivity).
- 세션 생성은 플랫폼(Tauri WKWebView 등)에 따라 graphOptimizationLevel all→basic→disabled + `freeDimensionOverrides` 순차 fallback.

## 2. 통합 구조 (이어하기 플로우)

- **Worker**: `packages/ui/src/workers/boardRecognition.worker.ts` — 메시지 프로토콜 `{recognizeBoard, reclassifyWithCorners, reclassifyWithHints, mokuInit, mokuDetect, mokuRefilter, mokuDispose, warpOnly}`. ONNX 추론이므로 워커 분리 필수.
- **훅**: `packages/ui/src/components/dialogs/board-recognition/hooks/useBoardRecognition.ts` — 이미지 로드/다운스케일, moku init(감도 슬라이더 → `mokuRefilter`), 코너 드래그 재보정.
- **다이얼로그**: `BoardRecognitionDialog.tsx` — boardSize 선택(9/13/19, 사용자가 반드시 선택 — moku 경로는 auto-detect 미사용), 코너 드래그 + 교차점 hint 보정 UI. import mode: `'blank' | 'merge'`.
- **병합(이어하기 핵심)** — `AppDropZone.tsx:155-185` `handleRecognitionImport`: 인식 stones → SGF 좌표 변환 → `addSetupPosition(blackCoords, whiteCoords, comment, clearCoords)` → gametree의 **setup property(AB/AW/AE)** 로 현재 게임에 오버레이. mode='blank'이면 기존 판 위 `AE`로 전체 클리어. 별도 경로 `handleRecognitionImportSGF`: SGF 문자열 → 새 파일 로드. 진입점 3곳: Header 툴바, AppDropZone, LibraryPanel(라이브러리에 `scan-{size}x{size}.sgf` 저장).
- **boardmatcher 패키지**: Sabaki 포트(패턴/수 명칭 매칭) — 인식 파이프라인과는 직접 연동 없음(별도 기능).

## 3. badukdojang 이식 시 체크포인트

1. **"이어하기"의 해석**: kaya는 새 대국이 아니라 *현재 게임에 setup 오버레이*(@kaya/gametree의 AB/AW). badukdojang은 `createGameState(size, tree)`가 이미 SGF 로드를 지원하므로 `buildSGF` 결과를 그 경로로 흘려주는 게 최단 경로.
2. **패키지 재사용 가능성**: `@kaya/board-recognition`은 npm으로도 배포될 가능성(kaya 저장소가 badukdojang의 상위 생태계) — 직접 복제보다 의존성/re-export 검토.
3. **모델 문제**: moku-v3 ONNX는 저장소에 미포함(HuggingFace/번들에서 확보) — 웹앱 배포 시엔 원격 URL + Cache API 캐시가 정석. 크기는 MB 단위(캐시 로그 기준)라 95MB급 바둑 네트워크와는 범위가 다름.
4. **onnxruntime-web은 별도 번들이고 MCTS의 KataGo와 완전 별개 인프라** — GTP bridge가 아닌 완전 클라이언트 사이드(WASM) 추론.
5. **제약**: 클래식 백엔드는 밝기 임계 기반이라 조명/판 재질 민감, 코너 실패 시 수동 드래그 필수. moku 디텍터도 감도 슬라이더(임계 재조정)와 교차점 hint가 확정 UX.

## 4. Moku 모델은 어떻게 개발됐나 (2026-09-17 조사)

정본: 훈련 리포 [github.com/kaya-go/moku](https://github.com/kaya-go/moku) (Python/HF Trainer/pixi), 모델·데이터셋은 HF `kaya-go` org([모델 4개](https://huggingface.co/kaya-go), [데이터셋 3개](https://huggingface.co/kaya-go/datasets)). 모델 카드는 자동생성 placeholder라 실정보는 훈련 리포 README 기준.

- **구조**: RT-DETR (NMS 불필요한 transformer 검출기 — ONNX 그래프가 깨끗함) + ResNet-18vd 백본 ~20MB. **COCO 사전학습 체크포인트 `PekingU/rtdetr_r18vd`에서 fine-tuning** (HF `Trainer` API, arXiv 2304.08069).
- **버전**: v1(2026-02)→v2(2026-03-14)→v3(2026-03-23). kaya 앱은 v3 사용. 클래스 체계 변화: v1 = 3클래스 `board`(전체판 bbox)/`black_stone`/`white_stone` → v3 = 흑돌/백돌/**board_corner**(판 전체 박스 대신 코너를 직접 검출하는 방향으로 진화).
- **학습 데이터**:
  - v1: Roboflow COCO 포맷 2개 소스 **약 492장** harmonized, 증강으로 인한 데이터 리크를 막기 위해 base-image 기준으로 분할(base-image grouping).
  - v3: [kaya-go/moku-v3](https://huggingface.co/datasets/kaya-go/moku-v3) — **1.49k rows** (train 1.38k / val 53 / test 50), source 3종(예: `go_game_v10`), 480~640px 이미지.
  - **공개 데이터셋**이므로 그대로 다운받아 실험 가능.
- **ONNX export**: `torch.onnx.export` opset 16+ dynamic batch → kaya 앱의 `moku-detector.ts`가 WASM 런타임으로 소비.
- **라이센스**: AGPL-3.0 (kaya 본체와 동일).

### 4(a) 우리 목적(바둑책 페이지 인식)에서의 시사점

- 학습 데이터가 **~500–1.5k장 규모의 작은 데이터셋**이고 실사진/스크린샷 중심 → 인쇄 다이어그램(채운 동그라미/테두리 동그라미, 수 번호 인쇄)은 도메인 갭이 있어 moku 그대로 재사용은 어려움.
- 반대로 **훈련 파이프라인이 소규모 fine-tuning으로 만들어졌다**는 점에서, "바둑책 전용 모델"은 **제로 개발이 아니라 동일 스크립트 + 인쇄 다이어그램 합성 데이터(SGF→책 스타일 렌더)** 로 **1~2천장 얹어 fine-tune**하는 것이 경로. 데이터가 작아도 되는 도메인.
- v3가 코너까지 검출하는 구조가 된 것도 힌트 — 바둑책 다이어그램도 "판 4코너 + 돌 2종"의 동일 문제 정식화가 맞고, 부분판(크롭 다이어그램) 대응은 별도 과제.

## 관련 노트

- [board-recognition-alternatives](board-recognition-alternatives.md) — kaya/moku **이외** 바둑판 인식 프로젝트·모델·데이터셋·논문 전수 조사
- [ideas.md](../ideas.md) — INBOX 3번 원본 아이디어
- [katago-engines](katago-engines.md) — 엔진 구조(KataGo GTP와 인식 파이프라인의 대비)
- [index.md](../index.md)
