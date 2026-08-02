#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
KAYA_DIR="$ROOT_DIR/third_party/kaya"
PATCH_DIR="$ROOT_DIR/patches/kaya"

echo "==> Setting up badukdojang (Kaya submodule + dependencies)..."

# 1. Initialize/update the Kaya submodule if it hasn't been checked out yet.
if [ ! -f "$KAYA_DIR/package.json" ]; then
  echo "--> Initializing third_party/kaya submodule..."
  git -C "$ROOT_DIR" submodule update --init --recursive -- third_party/kaya
fi

# 2. Apply local patches that are required for badukdojang to work with this
#    version of Kaya. These patches are kept in this repo because we cannot
#    modify the upstream Kaya repository.
if [ -n "$(ls -A "$PATCH_DIR" 2>/dev/null || true)" ]; then
  echo "--> Applying local Kaya patches..."
  for patch in "$PATCH_DIR"/*.patch; do
    if git -C "$KAYA_DIR" apply --check --whitespace=nowarn "$patch" >/dev/null 2>&1; then
      echo "    Applying $(basename "$patch")..."
      git -C "$KAYA_DIR" apply --whitespace=nowarn "$patch" || {
        echo "ERROR: Failed to apply $(basename "$patch")"
        exit 1
      }
    else
      echo "    $(basename "$patch") already applied or incompatible, skipping."
    fi
  done
fi

# 3. Install Kaya workspace dependencies and build only the packages we need.
echo "--> Installing Kaya workspace dependencies..."
cd "$KAYA_DIR"
bun install

echo "--> Building required Kaya packages..."
bun run --filter @kaya/goboard build
bun run --filter @kaya/sgf build
bun run --filter @kaya/gametree build
bun run --filter @kaya/themes build
bun run --filter @kaya/shudan build

# 4. Link the Kaya packages into Bun's global registry so badukdojang can
#    reference them with `link:` in package.json.
echo "--> Linking Kaya packages into global Bun registry..."
for pkg in goboard sgf gametree themes shudan; do
  (cd "$KAYA_DIR/packages/$pkg" && bun link)
done

# 5. Install badukdojang dependencies. At this point `link:@kaya/*` entries in
#    package.json will resolve to the globally linked packages above.
echo "--> Installing badukdojang dependencies..."
cd "$ROOT_DIR"
bun install

echo "==> Setup complete. You can now run:"
echo "    bun run dev"
echo "    bun run test:run"
echo "    bun run e2e"
