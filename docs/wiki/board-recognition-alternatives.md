---
title: 바둑판 인식 — kaya/moku 이외 대안 프로젝트·모델·논문 조사
description: kaya/moku(RT-DETR) 외 바둑판 인식 오픈소스·상용·데이터셋·논문 전수 조사 — 인쇄 다이어그램 인식 대안과 갭 포함
tags: [board-recognition, research, alternatives, cv]
created: 2026-09-17
updated: 2026-09-17
---

# 바둑판 인식 — kaya/moku 이외 대안 조사

> [kaya-board-recognition](kaya-board-recognition.md) 에서 다룬 kaya/moku(RT-DETR ONNX) **이외에**
> 바둑판(격자+흑/백 돌)을 이미지에서 인식하는 프로젝트·모델·데이터셋·상용 도구·논문이
> 또 무엇이 있는지 전수 조사한 레퍼런스. 모든 항목은 실제 URL fetch 로 존재 확인함(2026-09).
> 우리 진짜 목표(문서 4(a): **인쇄 바둑책 다이어그램 인식**) 관점에서 우선순위를 매겼다.

## 0. 한 줄 요약

이 분야는 **작지만 오래된 니치**이고, 마스터 인덱스가 하나 있다 — **Rémi Coulom 의 [Kifu-Snap 디렉토리](https://www.remi-coulom.fr/kifu-snap/)** (소스 리포 ~25 + 논문 ~25 큐레이션). 기술 스펙트럼은 **클래식 CV(Hough/homography) → CNN/YOLO/RT-DETR → 세그멘테이션(U-Net) → 최신 DL(Transformer/GAN/end-to-end)** 로 kaya/moku 는 그중 "작은 데이터 fine-tune DETR" 계열. **핵심 갭: 인쇄 다이어그램(채운/테두리 동그라미 + 인쇄 수 번호) 전용 공개 데이터셋·모델은 없다** → kaya 문서 4(a) 의 "합성 데이터로 fine-tune" 결론이 여전히 유효.

## 1. 우리 목표(인쇄 바둑책 다이어그램)에 가장 근접

| 프로젝트 | URL | 기법 / 특징 | 라이센스·상태 |
|---|---|---|---|
| **hanysz/img2sgf** | github.com/hanysz/img2sgf | **인쇄 다이어그램 전용** 명시("사진 아님"). SmartGo 스크린샷·구매 PDF·책 스캔·**사활 문제집 코너/변 부분판**(어느 코너인지 지정) 지원. 수 번호·마크·주석 무시, 내장 보드 에디터로 수동 보정, SGF 출력. 순수 OpenCV(원근보정 없음 = 약점). 알려진 실패: 동그라미 안 굵은 흑색 숫자가 흑돌로 오인 | ★62, **라이센스 없음**, 2023-10 이후 중단 |
| **Noirewinter/goboard-segmentation** | github.com/Noirewinter/goboard-segmentation | **U-Net** 으로 격자선 세그멘테이션 → 교차점 재구성. README 가 "**책 페이지 촬영 시 과도한 휘어짐(curling) 왜곡**"을 명시적 동기로 듦(=우리 케이스). 돌은 세그멘테이션 대상 아님(별도 검출기와 결합 전제). TFLite export | AGPL-3.0, ★5, 2024-06 |
| **kaorahi/lizgoban `src/sgf_from_image`** | github.com/kaorahi/lizgoban/tree/master/src/sgf_from_image | **브라우저 완결** 다이어그램 이미지→SGF 반자동. `sgf_from_image.js`+`perspective.js`, [라이브 데모](http://kaorahi.github.io/lizgoban/src/sgf_from_image/sgf_from_image.html). lizgoban 본체와 독립 동작 | GPL-3.0, 부모 ★207, 유지보수 중(2026-01) |
| **v01d-cypher/image2sgf** | github.com/v01d-cypher/image2sgf | **사활(tsumego) 다이어그램 배치** CLI(한국 문제아카데미용 제작). 이미지셋별 `BORDER/INTERVAL/OFFSET` 수동, `ORIGIN_CORNER→TARGET_CORNER` 리매핑 | ★18, 라이센스 없음, Python2, 2013 |
| **BiGo OCR** | bigo.baduk.org/ocr.html | 스캔 **인쇄 다이어그램** 인식(한국 바둑연감 스캔용). 페이지에서 다이어그램 크롭 도구, 240~260수 1~2분, BCR 출력(SGF 는 메일 교환). **클로즈드**, Win98~XP 프리웨어 — "DL 이전 시대에도 해결됐음"의 증거 | 클로즈드, 구식 |
| **BadukAI** | aki65.github.io | 판 **조각(fragment)** 로드 → 가로/세로 줄 수 + 어느 변 존재하는지 지정(예: "가로7 세로9, 왼쪽+아래 변" = 사활 코너) → 돌 검출 + 빨간 오버레이 검증 + 수동 보정. **검출 소스 미공개**(리포엔 index.html·APK 만) | 클로즈드, Android |

> **시사점**: 우리 문제 정식화("판 4코너 + 돌 2종", 부분판 대응)는 이미 여러 선행작과 일치. 단 **인쇄 다이어그램 전용 공개 가중치/데이터셋은 부재** → 가장 현실적 경로는 (1) img2sgf/gbr 의 클래식 파이프라인을 baseline 으로, (2) goboard-segmentation 의 U-Net 아이디어로 휘어짐 대응, (3) kaya 문서 4(a) 대로 **SGF→책 스타일 렌더 합성 데이터**를 만들어 moku 와 동일 스크립트로 fine-tune.

## 2. 클래식 CV 레퍼런스 (알고리즘 아이디어 원천)

- **skolchin/gbr** (github.com/skolchin/gbr) — **가장 완성도 높은 클래식 구현**. 4점 perspective → HoughLinesP 격자 추출 → dedup → 줄 개수로 판 크기 추론 → HoughCircles 돌 검출 → 흑백 overlap 조정. 필터 스택 풍부(R/B 채널 분리: red=백돌 blue=흑돌, threshold, dilate/erode, CLAHE, watershed, pyramid mean). 파라미터를 이미지별 `.GPAR` 로 저장. sgfmill 로 SGF. README: "AI 아님, 사용자 파라미터에 크게 의존". **MIT**, ★91, 2024-11 semi-maintained. **(a)4 (b)3**
- **tomasmcz/imago** (github.com/tomasmcz/imago) — 원근 왜곡 처리(img2sgf 가 못 하는 것). CLI `./imago img.jpg`, `-S`=SGF, `-m`=수동 격자. 논문(Musil 2014) 기반, 테스트スイ트 리포 + Haskell 포트 있음. **Python 2.7** 이 최대 장벽. ★89, 2020. **(a)3 (b)4**
- **Smallfireworks/Traditional-CV-Go-Parser** (github.com/Smallfireworks/Traditional-CV-Go-Parser) — **최신(2026-07)·알고리즘 설명 최고**. 최외곽 Hough 선을 믿지 않고 **thin dark line 의 축 투영에 weighted RANSAC 로 19항 등차수열 피팅** → 돌에 90% 가려진 변선도 내부 선에서 외삽 복원, off-lattice(창틀·테이블·나무결)는 outlier 로 기각. 픽셀별 voting 분류(밝기 임계 대신)로 하이라이트·최종수 마커에 강함. HoughCircles 교차검증으로 불일치 시 low-confidence 표시. C++/OpenCV, ★0, 라이센스 없음. **(a)4 (b)3**
- 그 외 검증됨(좁은 용도): **watchGo**(Haar cascade 3종, MIT, 2016 abandoned), **igoki**(Clojure+OpenCV, 실물판→OGS 온라인, EPL, ★172), **sgfication**(스크린샷→SGF, FastAPI+React, MIT, 2025), **CamKifu**(Keras/Theano, GPL-2.0), **kifu-recorder**(Android, MIT), **kifu-cam**(iOS 소스, C++/OpenCV, MIT, 2025), **GOimage2SGF**(C++, 웹캠), **Go-Image-Parser**(Fox Go 서버 스크린샷 기본값).

## 3. 다운 가능한 ML 모델·데이터셋

- **Roboflow "go-game-detection"** (universe.roboflow.com/test-yyxee/go-game-detection-mfkll) — **moku 와 가장 유사한 클래스 스키마**: `board / board_corner / black_stone / white_stone / empty / empty_corner / empty_edge` (7종). 실사진 243장, YOLO/COCO 다운로드, mAP@50 72%. **CC BY 4.0**. **(a)4**
- **noword/image2sgf** (github.com/noword/image2sgf) — **CNN**(판 격자망 vs 돌 망 분리 학습: `train_board.py`/`train_stone.py`/`train_part_board.py`/`train_board_mobile.py`). 스크린샷 캡처모드(pyautogui), wxPython GUI, sgfmill. 가중치는 GitHub Release(`stone.pth` 43MB, 전체 352MB). **2026-08 프로젝트(katago-handtalk)가 여전히 래핑** = 사실상 살아있음. 라이센스 없음, ★28. **(a)4 (b)3**
- **rociiu/yolo-go-stone-classifier** (huggingface.co/rociiu/yolo-go-stone-classifier) — YOLOv8n-cls, 64×64 패치 분류 `empty/black/white`, SGF→합성 렌더로 학습, CoreML 포함(iOS). **MIT**. (검출기 아닌 격자정렬 패치 분류기 — 합성 학습이라 실사진 저하 가능성). **(a)3**
- **Noirewinter/goboard-segmentation** — (위 1절과 동일) U-Net `board-seg.pth`(Release v0.1.0). **AGPL-3.0**. **(a)4 (b)3~4**
- **YOLO-GO** (github.com/zhuoyiyao97/YOLO-GO) — IEEE Access 2021 "강한 조명" 논문 코드. YOLO + ensemble(LightGBM/XGBoost/softmax/KNN/stacking + 손 가림 모델). 데이터셋은 Baidu Netdisk. README 없음, ★15.
- **Roboflow 데이터셋 다수**(lead, 사용 전 검증): `test-i8oy9/go-xuws0`(9,993장, board/no_board), `baduk/data-for-baduk-robot`(실사진, black/white, mAP94%), `song-efqy7/go-board-hbdkv`(108), `catkin-8c0fl/go-board`(229, +instance-seg), `hittry/go-board-4kjuw`(90, corners), `tis-workspace-fo6nr/go-board-m9e2v`(197, corners, 학습모델有). **Kaggle Gomrade**(davids1992/gomrade-...) — 라벨付き 바둑 이미지(로그인 게이트, 사이즈 미검증).
- ⚠️ **Sharpiless/gobang-object-detection-dataset** 는 **오목(Gomoku)** 이지 바둑 아님 — 오탐 주의(흑백 돌 YOLOv3 코드는 전이 가능).

## 4. 상용/프로덕션 (이미 제품화된 카테고리)

| 도구 | URL | 플랫폼 | 입력 | 비고 |
|---|---|---|---|---|
| **Kifu Snap** (R. Coulom) | kayufu.com/kifusnap | iOS/Android(2026-02)/Web | 실물판 사진·스크린샷 + **실시간 비디오 기록** | 클로즈드. Web TOS: 사진을 "인식 알고리즘 튜닝"에 사용 |
| **囲碁レコ AI (GoReko)** | gokifuai.com | iOS | 사이트 스크린샷 + 사진(19/13/9) | ¥300/월. 온디바이스 KataGo·정석검색·SGF/NGF/UGF |
| **GoVision** | govision.app | iOS(beta) | 실물판 사진 | "온디바이스 ML", 세부 비공개 |
| **Kifubara** | kifubara.app | iOS/Android/Web | 실물판 사진(~1s, 오프라인) | "비디오→SGF coming soon", 141K 프로기보 DB |
| **AhQ Go** | ezandroid.cn | Android | 사진 + **라이브 카메라 기록** | KataGo hawk-eye 리포트, 음성 AI |
| **VideoKifu/PhotoKifu** | oipaz.net/VideoKifu.html | Android/Win | **비디오 스트림**(무인 웹캠 OK) | 기부웨어. **논문 3편**(arXiv 1508.03269/1701.05419/1807.01577), 클래식 CV |
| **日本棋院 KIFU361** | (Nikkei DGXZQOUD118IL0R10C22A4000000) | 기관(천장 카메라) | 프로 대국실 오버헤드 비디오 | 2022.04~ 연 4000+국 자동 기보. Nikkei: "**선분 CV 먼저 시도→실패→AI 전환**"(시사점 큼) |
| **囲碁OCR (Silverstar)** | silverstar.co.jp/02products/igo_ocr | Win95~XP | 스캔 인쇄 다이어그램(TWAIN) | ¥8,000, **판매종료**. SGF/IG1/WWG |
| **Go Eye** | goeye-app.com | iOS(2012~) | 사진(책 다이어그램 auto, 실물판 수동 4코너) | 구식, 유료 |

> ⚠️ **AI-Sensei(ai-sensei.com) 는 이미지 인식 없음** — SGF/GIB/NGF/UGF/UGI 입력만(FAQ 확인). 자주 오해되므로 주의. **BadukPop** 도 사진→SGF 기능 확인 안 됨(사활/레슨/AI 대국만).

## 5. 학술 논문 (주요)

- **Musil 2014**, *Optical Game Position Recognition in the Board Game of Go* (Charles Univ. BSc, sup. Baudiš) — tomasm.cz/imago_files/go_image_recognition.pdf. **DL 이전 표준 레퍼런스**, imago 의 기반.
- **Corsolini & Carta** VideoKifu 3편 — arXiv [1508.03269](https://arxiv.org/abs/1508.03269)(사진 시리즈→대국 재구성) / [1701.05419](https://arxiv.org/abs/1701.05419)(비디오) / [1807.01577](https://arxiv.org/abs/1807.01577)(완전 자동, 멀티코어 double-check). PhotoKifu 알고리즘, 데이터셋 공개.
- **Hirsimäki 2005**, *Extracting Go Game Positions from Photographs*(GoCam) — users.ics.aalto.fi/thirsima/gocam/gocam.pdf. 초기 photo→position 파이프라인.
- **Zhuo et al. 2021**, *Reliable Go Game Images Recognition Under Strong Light Attack*, IEEE Access 9:160064 — 강한 조명/반사 강건성(YOLO-GO 코드).
- **Zheng & Qian 2023**, *Go-Game Image Recognition Based on Improved Pix2pix*, J. Imaging 9(12):273 — GAN image-to-image.
- **Zhou et al. 2023**, *MHRN-ST: Multi-stage Highlight Removal Network (Swin Transformer)*, Springer CSIP — 하이라이트 제거 + Transformer(로봇 플레이어 조건: 반사·오배치·가림).
- **Lin et al. 2025**, *End-to-end Go game record reconstruction from live broadcast videos*, Eng. Appl. of AI 162:112455 — 방송영상→기보, **지식증류 + 슈도라벨**로 라벨링 비용 절감.
- **Gerloff et al. 2025**, *Go Game Capture and Reconstruction of Missing Moves Using DL*, IEEE CoG — 가려진/누락 수 재구성.
- 그 외 초기: 이일병·기균도 1994(최초 한국 기보인식), Kang 2005(TV 바둑→기보), Shiba 2005(유전알고리즘), Park & Jun 2014(Circular Hough, 조명·돌错位 강건).

## 6. badukdojang 관점 정리

1. **바로 쓸 수 있는 오픈소스 baseline**: `skolchin/gbr`(MIT, 가장 완성도) 또는 `hanysz/img2sgf`(인쇄 다이어그램 전용). 단 둘 다 라이센스/유지보수 리스크(gbr=MIT 안전, img2sgf=라이센스 없음).
2. **moku 대체/보강 데이터**: Roboflow `go-game-detection`(CC-BY, board_corner 포함)이 스키마 가장 유사 → moku fine-tune 에 얹기 좋음.
3. **인쇄 다이어그램은 여전히 블루오션**: 공개 가중치 없음. → kaya 4(a) 의 "SGF→책 스타일 렌더 합성 + 소규모 fine-tune" 이 최단 경로. 휘어짐은 goboard-segmentation(U-Net) 아이디어 차용.
4. **라이센스 주의**: 강한 후보 다수(img2sgf, noword/image2sgf, Traditional-CV-Go-Parser)가 **라이센스 파일 없음**(=all-rights-reserved). AGPL(goboard-segmentation)·GPL(lizgoban)은 copyleft 전염. badukdojang 이식 시 **MIT/CC-BY/APACHE 우선**(gbr, watchGo, sgfication, kifu-cam, photokifu, katago-handtalk, Roboflow CC-BY).
5. **마스터 인덱스 북마크**: https://www.remi-coulom.fr/kifu-snap/ — 새 도구/논문 추적은 여기부터.

## 관련 노트

- [kaya-board-recognition](kaya-board-recognition.md) — kaya/moku(RT-DETR) 정본 조사. 이 노트의 기준점
- [ideas.md](../ideas.md) — INBOX 3번 "스크린샷 이어하기" / 바둑책 인식 아이디어
- [katago-engines](katago-engines.md) — 인식 결과(SGF)를 소비하는 엔진 측
- [index.md](../index.md)
