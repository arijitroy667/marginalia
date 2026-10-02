#!/usr/bin/env bash
# Runs the Playwright suite on Linux (real WebKit with IndexedDB Blobs, unlike Windows' WinCairo port) inside the
# official Playwright image, from a clean copy of the repo. Usage (from the repo root, Docker running):
#   docker run --rm --ipc=host -v "$PWD:/src:ro" -v pnpm-store:/pnpm-store \
#     mcr.microsoft.com/playwright:v1.63.0-noble bash /src/scripts/e2e-linux.sh [playwright args, e.g. --project webkit]
set -euo pipefail
mkdir -p /work
tar -C /src --exclude=./node_modules --exclude=./dist --exclude=./test-results --exclude=./.git -cf - . | tar -C /work -xf -
cd /work
corepack enable >/dev/null 2>&1 || npm i -g pnpm@10.28.0 >/dev/null
pnpm config set store-dir /pnpm-store >/dev/null
pnpm install --frozen-lockfile --reporter=silent
CI=1 pnpm exec playwright test "$@"
