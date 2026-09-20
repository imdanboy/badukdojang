---
title: KataGo 난이도 노브 사전
description: KataGo 엔진 강도/난이도 조절 파라미터 전체 목록 — 탐색 예산, Human-SL 모방, 탐색 왜곡, 수 선택 온도별 의미와 실험 포인트
tags: [katago, difficulty, parameters, engine-tuning, reference]
created: 2026-09-13
updated: 2026-09-14 (분석 표시 3분리 결정 추가)
---

# KataGo 난이도 노브 사전

> KataGo가 난이도(강도) 조절을 위해 제공하는 파라미터를 전부 나열하고, 각각이 무엇을 건드리는지 설명하는 학습용 레퍼런스. 엔진 실험 환경(ideas.md 방향 2번)에서 "어떤 노브를 만지면 어떤 변화가 생기는지"를 보고 판단하기 위한 자료. 정본은 KataGo 저장소의 `gtp_example.cfg`, `gtp_human5k_example.cfg`, `Analysis_Engine.md` — 아래 각 항목에 출처를 달아뒀다.

## 0. 개념 지도 — 난이도는 4개 층위로 만들어진다

KataGo의 난이도 노브는 전부 아래 4개 층위 중 하나에 속한다. 노브를 볼 때 "어느 층위인지"부터 물으면 이해가 빠르다.

| 층위 | 원리 | 대표 노브 |
|---|---|---|
| ① 탐색 예산 | MCTS가 생각할 시간/량 자체를 조절 — 근본 강도 | `maxVisits`, `maxPlayouts`, `maxTime` |
| ② 인간 모방 | 인간 기보로 학습된 별도 모델(Human-SL)로 수를 고름 — 급수를 직접 흉내 | `humanSLProfile`, `humanSLChosenMoveProp` |
| ③ 탐색 왜곡 | 탐색은 하되, 평가/탐색 분배를 일부러 비틀어 약하게 | `playoutDoublingAdvantage`, `wideRootNoise` |
| ④ 수 선택 온도 | 탐색 결과 중 확률적으로 수를 고름 — 실수 유발 | `chosenMoveTemperature` 계열 |

핵심 직관: **①을 낮추면 "멍청하게" 약해지고, ③④로 약화하면 "실수하는" 약함이 된다. ②는 아예 다른 두뇌로 갈아타는 것.** 실제 10급 봇은 ②+③+④의 조합으로 만든다 (①만 낮추면 visit이 1이어도 프로급 판단이 남아 10급을 제압함 — katago-engines.md 4(d) 표 참조).

---

## 1. 탐색 예산 (층위 ①)

### `maxVisits`
- **의미**: 루트에서 허용하는 MCTS 방문(visit) 총량 상한. KataGo 공식 문서가 지정하는 **일차 강도 레버**.
- **범위/기본값**: 1~무제한. `gtp_example.cfg` 기본 수백~수천, `gtp_human5k_example.cfg`는 40.
- **만지면**: 낮출수록 계산이 짧아져 약해짐. 단, Human-SL 모방(`humanSLChosenMoveProp=1.0`) 중이면 수 선택에 탐색을 거의 안 쓰므로 visits를 올려도 강해지지 않음 — 이때 visits는 pass/resign 판단에만 쓰임.
- **badukdojang**: 난이도 슬라이더가 20k=20, 15k=80, 10k=300, 5k=600, 1k=1000으로 매핑 (`engineSettings.ts` `difficultyToVisits`).

### `maxPlayouts`
- **의미**: playout(탐색 시뮬레이션 1회) 기준 상한. visit과 거의 같지만 그래프 탐색 전개 등에서 미세하게 다름.
- **만지면**: `maxVisits`와 동일 효과. 둘 중 하나만 cap해도 됨. 둘 다 설정하면 먼저 닿는 쪽이 적용.

### `maxTime`
- **의미**: 한 수당 벽시계 시간 상한(초).
- **만지면**: 느린 기기에서 "시간으로 강도 제한"할 때 씀. visits cap보다 변동성이 커서 난이도 조절기로는 덜 정밀.
- **badukdojang**: 설정 패널의 "생각 시간"이 이것 (1~30초).

### `numSearchThreads`
- **의미**: 한 포지션을 동시에 탐색하는 스레드 수. 스레드가 많으면 같은 시간에 더 많은 visit → 강해지지만 visit당 품질은 미세하게 떨어짐.
- **만지면**: 난이도 노브라기보다 성능 노브. MacBook Air M2는 2가 sweet spot. 주의: `useNoisePruning=false`(Human-SL 모드)일 땐 threads가 visits의 1/20 이하가 되도록 유지해야 탐색이 오작동하지 않음.

### `lagBuffer`
- **의미**: 네트워크/시스템 지연을 대비해 `maxTime`에서 미리 깎아두는 여유(초).
- **만지면**: 난이도와 무관. 온라인 서버 대응용.

---

## 2. Human-SL 모방 (층위 ②) — `-human-model b18c384nbt-humanv0.bin.gz` 필요

v1.15.0+ 에서 지원. 인간 기보(장기 40만국+)로 학습한 별도 네트워크를 로드해 "그 급수 사람"의 수를 예측하게 함. 정본: `gtp_human5k_example.cfg`, `Analysis_Engine.md`의 "Human SL Analysis Guide".

### `humanSLProfile`
- **의미**: 흉내 낼 등급 프로필. **가장 중요한 인간 모방 노브.**
- **값**: `rank_20k`~`rank_9d` (현대 오프닝 스타일), `preaz_20k`~`preaz_9d` (2016년 알파고 이전 오프닝 스타일), `rank_{흑등급}_{백등급}` (서로 등급을 아는 채 대국하는 모습 — 등급차 9급 이하는 권장), `proyear_1800`~`proyear_2023` (역사 속 프로/원생).
- **주의**: 고단 프로필은 탐색 없이는 그 등급의 *강도*까지 재현하지 못함 (원 논문 한계). 인간모방 강도 보정은 아래 lambda/temperature로.
- **badukdojang**: 난이도 슬라이더 → `difficultyToProfile` (20-18k→rank_20k, 13-12k→rank_15k, 10-8k→rank_10k, 5-3k→rank_5k, 1k→rank_1k).

### `humanSLChosenMoveProp`
- **의미**: 최종 수를 "인간 모방 수"로 뽑을 확률 (온도 적용 전).
- **범위**: 0.0~1.0. 1.0 = 사실상 순수 인간 모방(탐색 무시), 0.0 = 순수 KataGo MCTS.
- **만지면**: **인간성↔강함의 핵심 레버.** 0.3~0.5로 내리면 "인간적인 수 중에서도 나쁜 수는 피하는" 중간 체급이 됨.
- **badukdojang**: 고급 설정 패널에 노출 (기본 1.0).

### `humanSLChosenMoveIgnorePass`
- **의미**: true면 pass 시점만은 인간 모델 대신 KataGo 탐색으로 결정.
- **만지면**: 약한 프로필이 패를 이상하게(너무 일찍) 하는 증상 방지. `gtp_human5k_example.cfg` 기본 true.

### `humanSLChosenMovePiklLambda`
- **의미**: "KataGo가 심하게 못 마땅해하는 인간 수"를 억제하는 강도. 인간 수의 확률에 `exp(-utility손실/λ)` 꼴로 페널티.
- **기본값**: 사실상 무한대(1억) = 억제 끔 → 진짜 그 급수 사람처럼 실수도 함.
- **만지면**: 숫자를 낮추면(예: 0.4) 치명적 실수를 걸러내며 인간 *스타일*은 유지하는 중간 강도가 됨. 쓰려면 visits 수백 이상 + 아래 explore 파라미터로 나쁜 수도 탐색하게 해야 효과가 있음.

### `humanSL{Root,Pla,Opp}ExploreProbWeight{less,ful}`
- **의미**: 탐색 중 각 노드에서 PUCT 탐색을 인간 정책으로 할 비율. `Root`=루트만, `Pla`/`Opp`=트리 내부(자기/상대 차례), `Weightless`=평가만 하고 부모 가치에는 반영 안 함, `Weightful`=부모 가치에 반영(탐색 자체를 인간 시나리오로 굴림).
- **기본값**: 전부 0 (끔).
- **만지면**: 고급 요리법용. 예: `humanSLRootExploreProbWeightless=0.5` → visit의 절반을 인간 후보수 검증에 씀 (복기 분석에서 "인간이 둘 법한 수 전부 평가"에 사용). `OppExploreProbWeightful`을 크게 하면 "상대를 인간으로 가정하는" 접바둑 대응.

### `humanSLCpuctExploration` / `humanSLCpuctPermanent`
- **의미**: 인간 정책으로 탐색할 때의 PUCT 계수. `Permanent`는 visit이 늘어도 줄지 않는 탐색항 — "끝까지 약간의 실수 여지"를 모델링.
- **기본값**: exploration 0.50, permanent 0.2.
- **만지면**: permanent를 크게(1.0~2.0) 하면 확실히 나은 수여도 인간 후보수에 visit이 계속 배분됨 → 접바둑/핸디캡 실험용.

---

## 3. 탐색 왜곡 — 의도적 약화/강화 (층위 ③)

### `playoutDoublingAdvantage` (PDA)
- **의미**: 상대가 자신과 동급이 아니라 `2^PDA`배 많은 playout을 가진 것으로 *가정*하고 평가를 비틂. 음수 = 자신이 훨씬 약하다고 가정 → 약해짐. 양수 = 강하다고 가정 → 안전지향 강화.
- **범위**: -3.0 ~ +3.0 (설정 파일), badukdojang UI는 -3.0~+1.0. 기본 0.
- **특이점**: 이 값은 **분석(승률/ownership)에도 그대로 반영됨** — PDA를 깔고 분석하면 승률·집 판단이 왜곡됨 (2026-09-13에 우리가 분석 경로에서 PDA를 뺀 이유). GTP에서는 `playoutDoublingAdvantagePla=BLACK/WHITE`로 특정 색에만 적용 가능. 핸디캡 대응용 동적 버전은 `dynamicPlayoutDoublingAdvantageCapPerOppLead`.
- **만지면**: -0.25~-1.5 구간이 "탐색은 하되 여유 있는/나쁜 수를 두는" 약화에 효과적.
- **badukdojang**: 난이도 슬라이더 → 20-16k=-1.5, 11k=-0.75, 6k=-0.25, 3k+=0.

### `wideRootNoise`
- **의미**: 루트 탐색에 추가하는 노이즈 폭. 클수록 나쁜 수에도 visit이 골고루 분배됨 → 다양한 수를 시도 → 체감 약화.
- **범위**: 0.0~1.0 (극단 1은 판에 모든 수를 탐색). 기본 0.04 (분석용 프리셋 기준).
- **만지면**: 대국용으론 0.0이 최강. 0.1~0.3이면 "가끔 이상한 수"가 섞임.
- **badukdojang**: 난이도 슬라이더 → 20-18k=0.3, 13k=0.15, 8k+=0.04.

### `rootPolicyTemperature`
- **의미**: 루트 정책(prior) 분포를 부드럽게 만드는 온도. >1로 올리면 탐색 시작부터 모든 수를 넓게 봄.
- **만지면**: `wideRootNoise`와 비슷한 효과지만 정책 prior를 직접 변형한다는 점이 다름. analysis 쿼리 단위로 넘길 수 있는 노브.

### `rootFpuReductionMax`
- **의미**: "First Play Urgency" 조정 — 0으로 낮추면 탐색 안 해본 수를 더 관대하게 시도.
- **만지면**: 넓은 탐색 유도. 미세 조정용.

### (참고) 강도 관련 내부 노브
`useLcbForSelection`(LCB 기반 수 선택 = 강화), `useUncertainty`, `subtreeValueBiasFactor`, `useNoisePruning` — 전부 KataGo 자체 강화 기능이라 **약화 목적으론 안 만짐**. 다만 Human-SL 블렌딩 시 이들을 끄는 게 정석 프리셋(`gtp_human5k_example.cfg`).

---

## 4. 최종 수 선택 온도 (층위 ④)

탐색이 끝난 뒤 어떤 수를 "선택"할지의 무작위성. 탐색 자체는 강하게 돌리고 *선택*만 흔들어 실수를 만든다.

### `chosenMoveTemperature`
- **의미**: 최종 수를 `playSelectionValue^ (1/온도)` 비례 확률로 샘플링할 때의 온도. 0 = 항상 최선수, 클수록 랜덤.
- **기본값**: GTP 기본 0.10 (거의 최선수).
- **만지면**: 1.0~3.0이면 visit 분포에 비례해 수를 뽑음 → 약한 수가 나올 확률 증가. 20k급 프리셋은 3.0.
- **badukdojang**: 난이도 슬라이더 → 20k=3.0, 14k=2.0, 9k=1.5, 4k=0.8, 1k=0.3. 고급 패널에서 수동 지정 가능(`manualTemperature`).

### `chosenMoveTemperatureEarly` + `chosenMoveTemperatureHalflife`
- **의미**: 초반에는 온도를 높게, `Halflife`수를 기준으로 절반씩 줄여가며 `chosenMoveTemperature`로 수렴. (예: early 0.85, halflife 80, 본온도 0.70)
- **만지면**: "초반은 다양하게, 후반은 진지하게" 패턴. 인간 모방 시 자연스러움을 위해 사용.

### `chosenMoveTemperatureOnlyBelowProb`
- **의미**: 정책 확률이 이 값 미만인 수에만 온도를 적용. 예: 0.01 → "1% 미만으로 낮은 확률의 수는 거의 안 뽑게 억제".
- **만지면**: 1.0으로 두면 전체 분포에서 샘플링(진짜 인간 분포), 낮추면 "그 급수의 다수결 스타일"(실수는 걸러진 약간 강한 봇)이 됨. 인간 모방의 리얼리티 조절기.

### `chosenMoveSubtract` / `chosenMovePrune`
- **의미**: 온도 적용 전 각 수의 visit에서 깎아내는 양(subtract) / 특정 visit 미만 수를 후보에서 잘라내는 양(prune).
- **만지면**: 저visit 상황에서 소수 후보만 샘플링되는 걸 방지하는 보조 노브.

---

## 5. 행동(태도) 노브 — 강도는 아니지만 대국 경험을 좌우함

| 노브 | 의미 | 약한 봇 프리셋 |
|---|---|---|
| `allowResignation` | 기권 허용 여부 | true |
| `resignThreshold` | winLossUtility가 이 값 밑으로 내려가면 기권 (-1~0) | -0.99 (10급은 끝까지 싸울 수 있으니 아주 낮게) |
| `resignConsecTurns` | 기권 판단 유지 수 | 20 (기본 3 → 둔감하게) |
| `resignMinScoreDifference` | 점수차가 이보다 작으면 기권 금지 | 40 |
| `resignMinMovesPerBoardArea` | 최소 수진행 후에만 기권 (0.4 → 19x19 약 144수) | 0.4 |
| `delayMoveScale` / `delayMoveMax` | 응수를 인위적으로 늦추는 시간 스케일 (초) | 2.0 / 10.0 — 즉답 방지로 "사람 같은" 리듬 |

---

## 6. badukdojang 현재 매핑 요약

`src/lib/engineSettings.ts` 기준. 난이도 슬라이더(1~20급) 하나가 아래 노브들을 한 번에 굴린다:

| 급수 구간 | humanSLProfile | maxVisits | wideRootNoise | PDA | chosenMoveTemp |
|---|---|---|---|---|---|
| 20~18k | rank_20k | 20 | 0.30 | -1.5 | 3.0 |
| 15~13k | rank_15k | 80 | 0.15 | -0.75 | 2.0 |
| 10~8k | rank_10k | 300 | 0.04 | -0.25 | 1.5 |
| 5~3k | rank_5k | 600 | 0.0 | 0.0 | 0.8 |
| 1k | rank_1k | 1000 | 0.0 | 0.0 | 0.3 |

- **playStyle=strong**: maxVisits 800, 나머지 노브 전부 0 (순수 강한 KataGo).
- **분석(Ownership 토글)**: 난이도와 무관하게 `maxVisits=80, maxTime=2` + 노이즈 노브 전부 없음 — 승률/집은 항상 순수 강한 KataGo 기준 (2026-09-13 결정).
- **분석 표시 3분리 (2026-09-14 결정)**: 사이드바 토글을 승률/후보수/형세 3개 버튼으로 분리 (`GameSidebar.tsx` #winrate-toggle, #candidates-toggle, #ownership-toggle). 세 데이터가 전부 같은 분석 응답(rootInfo/moveInfos/ownership)에서 오므로 엔진 쿼리는 1회 공유 — 하나라도 켜면 fetch, 전부 끄면 중단 (KaTrain/OGS 방식). 분석 프로필(maxVisits 80 등)은 기존 결정 그대로 유지.

## 7. 실험 포인트 — 뭘 건드려볼 것인가

엔진 실험 환경(ideas.md 방향 2)에서 관찰할 만한 질문들:

1. **같은 급수, 다른 느낌**: `rank_10k` + `humanSLChosenMoveProp=1.0` (진짜 10급) vs `rank_5k` + `chosenMoveTemperature=3.0` (강한 봇의 랜덤 실수) — 어느 쪽이 "사람 같은가?"
2. **PDA의 왜곡 관찰**: PDA -1.5 상태에서 Ownership 분석을 켜면 승률/집이 어떻게 왜곡되는지 눈으로 확인 (분석 경로에 PDA를 뺀 이유를 몸으로 검증).
3. **visit 곡선**: `rank_10k` 고정 + maxVisits 20→300으로 올릴 때 실제 체감 강도가 얼마나 오르는지 (인간모방에선 visits 영향이 제한적임을 확인).
4. **Lambda 블렌딩**: `humanSLChosenMovePiklLambda`를 1억 → 0.4로 바꾸면 "실수는 하되 치명적이진 않은" 중간 체급이 되는지.

## 참고 자료

- `cpp/configs/gtp_example.cfg` — https://github.com/lightvector/KataGo/blob/master/cpp/configs/gtp_example.cfg
- `cpp/configs/gtp_human5k_example.cfg` — https://github.com/lightvector/KataGo/blob/master/cpp/configs/gtp_human5k_example.cfg
- `docs/Analysis_Engine.md` (Human SL Analysis Guide 포함) — https://github.com/lightvector/KataGo/blob/master/docs/Analysis_Engine.md
- `docs/GTP_Extensions.md` (`kata-set-param` 런타임 조절) — https://github.com/lightvector/KataGo/blob/master/docs/GTP_Extensions.md
- Human-SL 모델 릴리스 — https://github.com/lightvector/KataGo/releases/tag/v1.15.0

## 관련 노트

- [katago-engines](katago-engines.md) — 엔진 통합 사전 조사 (모델 카탈로그, 약 엔진 비교, 10급 매핑)
- [setup-and-usage](setup-and-usage.md) — 설치/실행/테스트 전체 흐름
- [ideas.md](../ideas.md) — 엔진 실험 환경 방향 (INBOX 2번)
- [index.md](../index.md)
