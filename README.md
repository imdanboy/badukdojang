# badukdojang

A React 19 SPA for studying Go (baduk), with an optional KataGo AI engine
integration served by a Bun bridge process during local development.

## Quick start (already set up once)

If `config/engine.json` and `~/katago-models/` already exist on this
machine (first-time setup below), running the app is one command:

```bash
bun run start
```

This starts the KataGo bridge first and opens the Vite dev server once
the engine is ready. Detailed usage: [docs/wiki/setup-and-usage.md](docs/wiki/setup-and-usage.md).

## Prerequisites

- [Bun](https://bun.sh) (used to run both the Vite dev server and the
  KataGo bridge)
- [Node.js](https://nodejs.org) (only required by tooling that Bun does
  not yet cover, e.g. Playwright)
- [KataGo](https://github.com/lightvector/KataGo) — the Go engine that
  powers move analysis

```bash
brew install katago
```

## Setup

Kaya core packages (`@kaya/goboard`, `@kaya/gametree`, `@kaya/sgf`,
`@kaya/shudan`, `@kaya/themes`) are consumed as a Git submodule under
`third_party/kaya` and linked via Bun. Run the setup script once after
cloning:

```bash
bun run setup
```

This will check out the submodule (our fork `imdanboy/kaya`, branch
`badukdojang` — includes local patches as real commits), build the Kaya
packages, link them into Bun's global registry, and install the rest of
the project dependencies. Upstream sync workflow:
[docs/wiki/setup-and-usage.md](docs/wiki/setup-and-usage.md).

> Do not run `bun install` alone on a fresh clone — the `@kaya/*` `link:`
> entries in `package.json` require the setup step first.

## KataGo model files

The bridge expects two model files. Download them once and keep them on
disk; the dev workflow references them via environment variables.

| Model | Approx. size | Purpose |
| --- | --- | --- |
| `kata1-b18c384nbt-s6582M.bin.gz` | ~93 MB | Standard network used for `gtp` play and baseline analysis |
| `b18c384nbt-humanv0.bin.gz` | ~94 MB | Human SL profile used by the analysis engine when available |

The exact filenames and download links change as new releases are
published; grab the latest matching pair from the
[KataGo networks page](https://katagotraining.org/networks/)
and [extra networks page](https://katagotraining.org/extra_networks/).

```bash
curl -L -o ~/katago-models/kata1-b18c384nbt.bin.gz \
  https://media.katagotraining.org/uploaded/networks/models/kata1/kata1-b18c384nbt-s6582191360-d3422816034.bin.gz

curl -L -o ~/katago-models/b18c384nbt-humanv0.bin.gz \
  https://media.katagotraining.org/uploaded/networks/models_extra/b18c384nbt-humanv0.bin.gz
```

## Engine config (`config/engine.json`)

The bridge reads machine-specific values (binary, model paths, port)
from `config/engine.json`, not from environment variables:

```bash
cp config/engine.example.json config/engine.json
```

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

`~` is expanded to `$HOME`. Environment variables
(`KATAGO_MODEL_PATH`, `HUMAN_MODEL_PATH`, `KATAGO_BINARY`,
`KATAGO_CONFIG_PATH`, `KATAGO_ANALYSIS_CONFIG_PATH`, `PORT`) still
override the file, which is useful for tests.

`config/engine.json` is gitignored because it contains absolute paths;
the template is `config/engine.example.json`.

## Local development (two terminals)

The frontend and the KataGo bridge are separate processes. `bun run
start` runs both (bridge first, then Vite). To run them manually:

```bash
# Terminal 1 — KataGo bridge
bun run start:engine

# Terminal 2 — Vite dev server
bun run dev
```

Then open the printed Vite URL and verify the engine in the browser
devtools console:

```js
await fetch('/api/gtp/health').then(r => r.json());
// { status: 'ok' }
```

If the bridge is **not** running, the same call will fail with a
network error in the console. That is expected — the SPA should
degrade gracefully and surface the offline state in the UI.

## How the dev proxy works

`vite.config.ts` declares a dev-only proxy:

```ts
server: {
  proxy: {
    '/api/gtp': { target: 'http://localhost:8787', changeOrigin: true },
  },
}
```

This proxy is **only active in `bun run dev`**. `bun run build` produces
a static `dist/` and ships no backend URL — production deployments must
point `/api/gtp` at a real reverse-proxied bridge (or inject a
runtime-configured public URL) instead of relying on Vite's dev server.

## Available scripts

| Script | What it does |
| --- | --- |
| `bun run setup` | One-time clone/build/link of the Kaya submodule and install dependencies |
| `bun run start` | Start the KataGo bridge, then the Vite dev server once it is ready |
| `bun run dev` | Vite dev server with the `/api/gtp` proxy to the bridge |
| `bun run start:engine` | Run the Bun GTP bridge against a local KataGo binary |
| `bun run build` | Type-check and produce a static `dist/` (no proxy, no backend URL baked in) |
| `bun run preview` | Serve the built `dist/` for smoke testing |
| `bun run test:run` | Run the Vitest unit suite once |
| `bun run e2e` | Run the Playwright end-to-end suite |
| `bun run typecheck` | Type-check the SPA only (excludes the Bun server) |
