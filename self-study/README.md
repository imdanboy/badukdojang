---
title: "AlphaGo Self-Study"
---

# 개요

badukdojang 리포 최상위의 독립 하위 프로젝트.
알파고 논문(`Silver et al., 2016`)과 후속 AlphaZero 논문을 **literate programming** 방식으로 학습한다 — 글(이론/수식)과 코드를 한 문서(`.qmd`)에서 함께 작성하고, 코드는 실제로 실행되어 그 결과가 문서에 박힌다.

## 왜 별도 폴더인가

- 루트 앱(src/)은 TS + Vite + bun. 본 프로젝트는 Python + Quarto. **툴체인 분리**.
- `docs/`는 MOC 기반 wiki 규칙(frontmatter/description/kebab-case)이 지배. Quarto `.qmd`는 이 규칙과 충돌.
- LLM 탐색 보호: `docs/` 전체 grep 금지 규칙(AGENTS.md)과 동일하게, 본 폴더도 README를 통해서만 진입.

## 범위 (스코프 축소가 핵심)

알파고 원본 재현(전체 19x19, 분산 TPU)은 1인 학습에선 사실상 불가. 대신 **작은 판 게임**(Othello / Connect Four / 7x7 미니 바둑)에서 3대 축만 구현해 개념 POC를 성립시킨다.

1. **MCTS + UCB1** — 순수 NumPy. (1장)
2. **Policy network (SL)** — 작은 CNN. PyTorch. (2장)
3. **Value network + RL** — 셀프플레이. (3장)
4. **Mini-AlphaGo** — 둘을 통합. (4장)

벤치마크 흐름: 무작위 → MCTS만 → 네트워크 추가 → 셀프플레이. 각 단계별 승률/트리 통계를 `.qmd`에 실행 결과로 남겨 "이해했는지"를 자동 검증.

## 출력

- `quarto render` — HTML / PDF / EPUB 한 방에 생성 (`_book/`).
- 목표인 PDF/ebook 확장은 기본 기능. GitHub Pages 배포도 `quarto publish` 한 줄.

## 폴더 구조

```
self-study/
├── README.md            # 본 파일
├── _quarto.yml         # book 설정 (HTML/PDF/EPUB)
├── .gitignore          # study 전용 산물 무시
├── pyproject.toml      # Python 의존성 (루트 bun과 분리)
├── index.qmd           # book 표지/개요
├── 01-mcts/            # MCTS + UCB1
│   └── index.qmd
├── 02-policy-net/      # SL policy network
│   └── index.qmd
├── 03-value-net/       # RL + value network
│   └── index.qmd
├── 04-mini-alphago/    # 통합 POC
│   └── index.qmd
├── games/              # 게임 환경 (Othello/미니바둑)
└── references/         # 논문 PDF, 링크, 노트
    └── index.qmd
```

## 작업 흐름 (Vision → Spec → Task)

각 챕터는 거울 페이지(https://opencode.ai)의 Wave 흐름을 그대로 가져간다 — 단, 본 폴더는 학습용이므로 todo 추적은 README나 챕터 qmd 안에서 가볍게.

첫 2주 플랜:
- **주 1**: `games/`에 7x7 미니바둑 또는 Othello 환경 + `01-mcts/`에 MCTS 구현 → 무작위 vs MCTS 벤치마크를 `.qmd`에 render
- **주 2**: `02-policy-net/` 슈퍼바이즈드 러닝 + 논문 3~4장 독해 정리

## 레퍼런스

- `suragnair/AlphaZero-General` — 게임 에이전트 일반화 재구현, 구조 참고
- 논문 PDF는 `references/`에 두고 인용.

## 주의사항

1. **루트 툴체인과 절대 섞지 말 것.**
   - Python 의존은 본 폴더 안 `pyproject.toml`에서만 (루트는 bun).
   - `quarto render`는 본 폴더에서만. 루트 `package.json` 스크립트에 추가 금지.
   - tsconfig/vite/vitest 설정 본 폴더로 건드리지 말 것.

2. **산물 커밋 금지.** `self-study/.gitignore`로 `_book/`, `*.pdf`, `*.epub`, `*.pt`, `data/`, `models/` 무시. 본 파일 명시적 예외(`!references/**/*.npy`)만 허용.

3. **`docs/` wiki와 규칙 분리.**
   - wiki 노트 frontmatter/description/kebab-case 규칙은 본 폴더에 적용 않함 (Quarto 가이드 우선).
   - `docs/index.md`(MOC)엔 단 한 줄 링크만 추가. 본 폴더의 MOC는 `README.md` + `index.qmd`.

4. **LLM 탐색 보호 (AGENTS.md 규칙 확장).**
   - `self-study/` 전체 grep/read 금지. README(본 파일)를 통해서만 후보 좁히고, 필요 챕터 `.qmd`만 read.
   - 새 챕터 추가 시 `README.md`와 `_quarto.yml` 양쪽에 목차 항목을 동기화.

5. **POC는 실행되어야 의미 있다.**
   - `.qmd` 코드 청크는 항상 실행 가능 상태 유지 (`freeze: auto`로 재렌더 비용 절약).
   - "이해했는지" 검증은 벤치마크 render 결과로 남긴다 — 글만 있는 qmd는 미완으로 간주.

6. **라이선스/저작권:** 논문 PDF는 `references/`에 두되, 학습용 링크 또는 인용만(GET/재배포 없이). reproducible quote는 최소.