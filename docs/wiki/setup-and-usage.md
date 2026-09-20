---
title: badukdojang 설치 및 사용법
description: badukdojang 클론부터 KataGo bridge 실행, 개발 서버, 테스트까지 전체 사용법.
tags: [setup, usage, katago, kaya, bun, dev]
created: 2026-08-03
updated: 2026-09-20 (kaya 포크/패치브랜치/업스트림 동기화 절차 추가)
---

# badukdojang 설치 및 사용법

> 이 노트는 badukdojang 저장소를 처음 받은 상태에서부터 개발 서버를 띄우고, KataGo AI와 바둑을 두고, 테스트를 돌리는 전체 흐름을 담는다.

---

## 사전 요구사항

| 도구 | 용도 | 설치 확인 |
|------|------|-----------|
| [Bun](https://bun.sh) | Vite dev server, KataGo bridge, 테스트 실행 | `bun --version` |
| [Node.js](https://nodejs.org) | Playwright 등 Bun이 아직 커버하지 않는 도구 | `node --version` |
| [KataGo](https://github.com/lightvector/KataGo) | AI 대국, 분석, 계가 | `katago version` |

```bash
brew install bun node katago
```

---

## 1단계: 저장소 클론

Kaya는 Git Submodule로 포함되어 있으므로 `--recursive`로 클론한다.

```bash
git clone --recursive https://github.com/<your-org>/badukdojang.git
cd badukdojang
```

> **Kaya 서브모듈 구조 (2026-09-20~, 정석 포크 방식)**: `.gitmodules`는
> **포크** `https://github.com/imdanboy/kaya.git`을 가리키고, badukdojang 전용
> 패치는 포크의 **`badukdojang` 브랜치**에 커밋되어 있다. 서브모듈 포인터가
> 그 브랜치의 SHA를 기록하므로 새 클론 유저도패치가 적용된 소스를 그대로 받는다.
> 포크의 `main`은 upstream(`kaya-go/kaya`)을 그대로 추종한다.
> `patches/kaya/*.patch`(레거시)는 동일 수정분을 담고 있어 setup에서
> idempotent하게(`already applied → skip`) 동작하지만, 신규 수정은 레포
> 모노가 아니라 포크 `badukdojang` 브랜치 커밋으로 관리한다.

### Kaya 업스트림 동기화 절차

upstream을 따라잡을 때 패치를 잃지 않는 순서:

```bash
cd third_party/kaya
git remote -v                       # upstream = kaya-go/kaya, fork = imdanboy/kaya (이미 설정됨)
git fetch upstream
git checkout main
git rebase upstream/main && git push fork main        # (fork가 upstream과 같으면 rebase/skip)
git rebase main badukdojang         # 패치 브랜치를 새 upstream 위로
git push --force fork badukdojang   # rebase했으므로 force
```

그 뒤 부모 레포에서 포인터 갱신:

```bash
cd ../..
git submodule update --remote third_party/kaya   # .gitmodules의 branch=badukdojang 따름
git add third_party/kaya && git commit -m "chore: bump kaya submodule"
```

> 포크에서 `badukdojang` 브랜치에 새 커밋(패치 추가 등)을 하려면 같은 경로로
> 작업 후 `git push fork badukdojang` → 부모 포인터 갱신.

이미 일반 clone을 했다면:

```bash
git submodule update --init --recursive
```

---

## 2단계: Kaya 의존성 설치

`@kaya/*` 패키지는 npm이 아닌 로컬 `third_party/kaya`에서 빌드 후 Bun 전역 registry에 링크된다.

```bash
bun run setup
```

`bun run setup`은 다음을 한 번에 처리한다:

1. `third_party/kaya` 서브모듈 checkout
2. `patches/kaya/*.patch` 적용 (이미 적용되면 skip)
3. Kaya workspace 의존성 설치
4. 필요한 Kaya 패키지 빌드: `@kaya/goboard`, `@kaya/sgf`, `@kaya/gametree`, `@kaya/themes`, `@kaya/shudan`
5. `bun link`로 전역 registry 등록
6. badukdojang 의존성 설치

> ⚠️ **주의**: `bun install`만으로는 `@kaya/*` `link:` 의존성을 해석할 수 없다. 반드시 `bun run setup`을 먼저 실행해야 한다.

---

## 3단계: KataGo 모델 다운로드 (한 번만)

```bash
mkdir -p ~/katago-models

# 기본 네트워크 (s6582M, 가장 강한 b18 모델)
curl -L -o ~/katago-models/kata1-b18c384nbt.bin.gz \
  https://media.katagotraining.org/uploaded/networks/models/kata1/kata1-b18c384nbt-s6582191360-d3422816034.bin.gz

# Human-SL 네트워크 — 인간 이동 예측 모델
curl -L -o ~/katago-models/b18c384nbt-humanv0.bin.gz \
  https://media.katagotraining.org/uploaded/networks/models_extra/b18c384nbt-humanv0.bin.gz
```

최신 모델은 [KataGo networks](https://katagotraining.org/networks/)와 [extra networks](https://katagotraining.org/extra_networks/)에서 확인한다.

---

## 4단계: 엔진 설정 파일 작성 (한 번만)

KataGo 모델 경로·바이너리·포트 등 머신 종속 값을 environment variable 대신 **`config/engine.json`** 파일에서 읽는다.

```bash
cp config/engine.example.json config/engine.json
```

`config/engine.json` 예시 (`~` 는 자동으로 `$HOME` 으로 확장됨):

```json
{
  "katagoBinary": "katago",
  "katagoConfigPath": "/opt/homebrew/Cellar/katago/1.16.4/share/katago/configs/gtp_example.cfg",
  "modelPath": "~/katago-models/kata1-b18c384nbt.bin.gz",
  "humanModelPath": "~/katago-models/b18c384nbt-humanv0.bin.gz",
  "analysisConfigPath": null,
  "port": 8787
}
```

필드별 의미:
| 필드 | 기본값 | 비고 |
|------|--------|------|
| `katagoBinary` | `katago` | PATH 에 있는 바이너리명 또는 절대경로 |
| `katagoConfigPath` | Homebrew 1.16.4 경로 | `katago gtp`용 설정. `brew list --verbose katago` 로 확인 |
| `modelPath` | — (필수) | KataGo 메인 네트워크. `~` 확장됨 |
| `humanModelPath` | — (옵션) | Human-SL 네트워크. 설정 안 하면 `humanModelAvailable=false` |
| `analysisConfigPath` | `null` | `null`이면 `config/analysis.cfg` 자동 사용 |
| `port` | `8787` | KataGo bridge 포트 |

> `config/engine.json` 은 gitignored (머신마다 다른 절대경로 포함). 템플릿은 `config/engine.example.json`.
>
> **우선순위**: 환경변수 > `config/engine.json` > 기본값. 환경변수(`KATAGO_MODEL_PATH`, `HUMAN_MODEL_PATH`, `KATAGO_BINARY`, `KATAGO_CONFIG_PATH`, `KATAGO_ANALYSIS_CONFIG_PATH`, `PORT`)는 여전히 override 로 사용 가능 (테스트 등).

---

## 5단계: 개발 서버 실행

### 한 번에 실행 (권장)

```bash
bun run start
```

KataGo bridge가 준비되면 자동으로 Vite dev server를 띄운다.

### 수동으로 두 개 터미널

```bash
# Terminal 1 — KataGo bridge (먼저 켜야 함)
bun run start:engine
# → "KataGo bridge listening on http://localhost:8787"

# Terminal 2 — Vite dev server
bun run dev
```

브라우저가 열리면 개발자 도구 콘솔에서 bridge 상태를 확인한다.

```js
await fetch('/api/gtp/health').then(r => r.json())
// → { status: "ok", version: "1.16.x", humanModelAvailable: true }
```

이 호출이 실패하면 bridge가 켜지지 않은 것이다. **bridge가 켜져 있어야 설정 패널의 "엔진 켜짐" 토글이 의미를 갖는다.**

---

## 6단계: 테스트

### 단위 테스트

```bash
bun run test:run
```

### E2E 테스트

Playwright 브라우저가 필요하다. 처음 한 번만:

```bash
bunx playwright install chromium
```

이후:

```bash
bun run e2e
```

---

## 7단계: 프로덕션 빌드

```bash
bun run build
```

`dist/`에 정적 파일이 생성된다. `bun run preview`로 smoke test할 수 있다.

> `vite.config.ts`의 `/api/gtp` proxy는 `bun run dev`에서만 동작한다. 프로덕션 배포 시에는 별도 reverse proxy나 runtime-configured public URL이 필요하다.

---

## 흔한 문제와 해결

| 증상 | 원인 | 해결 |
|------|------|------|
| `bun install`에서 `@kaya/* not linked` | `bun run setup` 미실행 | `bun run setup` 실행 |
| `patch already applied or incompatible` | setup 중복 실행 | 정상 메시지, 무시 |
| `"엔진이 꺼져 있습니다"` 토스트 | bridge 서버 미실행 | `bun run start:engine` 또는 `bun run start` |
| `"엔진 연결 실패"` / 503 | bridge는 켜졌으나 KataGo spawn 실패 | `config/engine.json`의 `modelPath` 확인 (파일 존재 `ls ~/katago-models/`) |
| `humanModelAvailable: false` | Human-SL 모델 경로 오류 | `config/engine.json`의 `humanModelPath` 확인 |
| AI 응답 없음 | `maxTime` 초과 또는 `maxVisits` 너무 큼 | 설정 패널에서 생각 시간 5초, 난이도 10급 조정 |

---

## 관련 노트

- [katago-engines](katago-engines.md) — KataGo 기능/모델/튜닝 상세 설명
- [katago-ai-integration-report](../archive/katago-ai-integration-report.md) — AI 기능 완료 보고
- [badukdojang-migration](../archive/badukdojang-migration.md) — React 19 + @kaya 마이그레이션 기록
- [index.md](../index.md) — 위키 MOC
- [ideas.md](../ideas.md)
