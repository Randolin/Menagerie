#!/bin/sh
# Update-and-cycle the profile server from the repo's default branch.
#
# Safe by construction: the new image is BUILT before the old container is
# touched (a failed build leaves the running server alone), and the SQLite
# database lives in the menagerie-sync-data volume, untouched by container swaps.
# The clone this runs in is a deploy copy — never hand-edited — so syncing
# is a hard reset to origin/main.
#
# Usage: update.sh [--force]
#   (no args)  update only when origin/main has new commits (timer mode)
#   --force    rebuild and cycle even with no new commits (button mode)
# Env: MENAGERIE_REPO_DIR (default /opt/menagerie)
set -eu

REPO_DIR="${MENAGERIE_REPO_DIR:-/opt/menagerie}"
cd "$REPO_DIR"

git fetch --quiet origin main
LOCAL="$(git rev-parse HEAD)"
REMOTE="$(git rev-parse origin/main)"
if [ "$LOCAL" = "$REMOTE" ] && [ "${1:-}" != "--force" ]; then
  exit 0
fi

echo "updating $LOCAL -> $REMOTE"
git reset --hard origin/main

# Build first: if this fails, the old container keeps serving.
docker build -f deploy/Dockerfile -t menagerie-sync .

docker stop menagerie-sync >/dev/null 2>&1 || true
docker rm menagerie-sync >/dev/null 2>&1 || true
docker run -d --name menagerie-sync --restart unless-stopped \
  -p 127.0.0.1:8787:8787 -v menagerie-sync-data:/data \
  -e MENAGERIE_TRUST_PROXY=1 menagerie-sync

sleep 2
curl -fsS http://127.0.0.1:8787/v2/health
echo " deployed $(git rev-parse --short HEAD)"
