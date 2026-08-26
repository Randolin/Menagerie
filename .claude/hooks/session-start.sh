#!/bin/bash
# Make a Claude Code on the web container able to run the full ladder.
#
# The base image ships Node 22.22.2, one patch below the 22.22.3 the Angular
# CLI demands, which blocks `npm run test:app`, `npm run build` and `npm run
# e2e` — the only steps that type-check templates. CI runs Node 24, so this
# installs 24 and puts it first on PATH for the session.
#
# Local sessions are left alone: they use whatever Node the developer chose.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

NODE_VERSION="24.15.0"
NODE_DIR="$HOME/.local/node-v${NODE_VERSION}-linux-x64"

# Idempotent: a cached container already has it unpacked.
if [ ! -x "$NODE_DIR/bin/node" ]; then
  echo "Installing Node v${NODE_VERSION}…"
  mkdir -p "$HOME/.local"
  TARBALL="$(mktemp -d)/node.tar.xz"
  curl -sSfL -o "$TARBALL" \
    "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz"
  tar -xf "$TARBALL" -C "$HOME/.local"
  rm -rf "$(dirname "$TARBALL")"
fi

export PATH="$NODE_DIR/bin:$PATH"
echo "export PATH=\"$NODE_DIR/bin:\$PATH\"" >> "$CLAUDE_ENV_FILE"
echo "Node $(node -v), npm $(npm -v)"

cd "$CLAUDE_PROJECT_DIR"
npm install --no-audit --no-fund

# Playwright's browser is pre-installed in the image; the e2e suite finds it
# through PLAYWRIGHT_BROWSERS_PATH. Nothing to download.
echo "Ready — the full verification ladder in CLAUDE.md should run."
