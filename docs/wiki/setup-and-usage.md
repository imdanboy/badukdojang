---
title: badukdojang 설치 및 사용법
description: badukdojang 클론부터 KataGo bridge 실행, 개발 서버, 테스트까지 전체 사용법.
tags: [setup, usage, katago, kaya, bun, dev]
created: 2026-08-03
updated: 2026-08-03
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

## 4단계: 환경변수 설정

터미널 세션마다 export하거나 `~/.zshrc`에 추가한다.

```bash
export KATAGO_MODEL_PATH="$HOME/katago-models/kata1-b18c384nbt.bin.gz"
export HUMAN_MODEL_PATH="$HOME/katago-models/b18c384nbt-humanv0.bin.gz"

# 기본값과 다를 경우:
# export KATAGO_BINARY=katago
# export KATAGO_CONFIG_PATH=/opt/homebrew/Cellar/katago/1.16.4/share/katago/configs/gtp_example.cfg
# export PORT=8787
```

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
| `"엔진 연결 실패"` / 503 | bridge는 켜졌으나 KataGo spawn 실패 | `KATAGO_MODEL_PATH`, `HUMAN_MODEL_PATH` 확인 |
| `humanModelAvailable: false` | Human-SL 모델 경로 오류 | `HUMAN_MODEL_PATH` 확인 |
| AI 응답 없음 | `maxTime` 초과 또는 `maxVisits` 너무 큼 | 설정 패널에서 생각 시간 5초, 난이도 10급 조정 |

---

## 관련 노트

- [katago-engines](katago-engines.md) — KataGo 기능/모델/튜닝 상세 설명
- [katago-ai-integration-report](../archive/katago-ai-integration-report.md) — AI 기능 완료 보고
- [badukdojang-migration](../archive/badukdojang-migration.md) — React 19 + @kaya 마이그레이션 기록
- [index.md](../index.md) — 위키 MOC
- [ideas.md](../ideas.md)
