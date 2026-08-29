#!/bin/sh
# Update-and-cycle the profile server from the repo's default branch.
#
# Safe by construction: the new image is BUILT before the old container is
# touched (a failed build leaves the running server alone), and the SQLite
# database lives in the menagerie-sync-data volume, untouched by container
# swaps. The clone this runs in is a deploy copy — never hand-edited — so
# syncing is a hard reset to origin/main.
#
# Usage: update.sh [--force]
#   (no args)  update only when origin/main has new commits (timer mode)
#   --force    rebuild and cycle even with no new commits (button mode)
set -eu

# The clone is the parent of this script's own directory.
#
# Deliberately NOT an environment variable with a default. The systemd unit
# that invokes this may have been installed long ago, under an older variable
# name, and a default that does not match the box is how an updater silently
# stops updating — which is the one failure an unattended deploy cannot
# recover from without someone logging in. The script knows where it lives.
REPO_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$REPO_DIR"

git fetch --quiet origin main
LOCAL="$(git rev-parse HEAD)"
REMOTE="$(git rev-parse origin/main)"

# What is actually SERVING, not what git last checked out. An updater that
# keys off the git ref alone has one wedged state it can never leave: a run
# that resets the clone and then dies leaves HEAD at origin/main with the old
# container still up, so every later run says "already up to date" while
# serving code from before the failure — and nobody finds out until they log
# in. Comparing against the running container instead makes this converge on
# the desired state rather than react to an event, so a half-finished run is
# simply retried at the next tick.
DEPLOYED="$(docker inspect -f '{{index .Config.Labels "menagerie.commit"}}' \
  menagerie-sync 2>/dev/null || true)"

if [ "$LOCAL" = "$REMOTE" ] && [ "$DEPLOYED" = "$REMOTE" ] && [ "${1:-}" != "--force" ]; then
  exit 0
fi

echo "updating $LOCAL -> $REMOTE"
git reset --hard origin/main

# That reset just rewrote this script underneath the shell executing it, and a
# shell reads a script in chunks rather than up front — so the rest of this
# file may no longer be what the shell is part-way through. Hand off to the new
# copy exactly once, guarded so it cannot loop.
if [ "${MENAGERIE_UPDATE_REEXECED:-}" != "1" ]; then
  MENAGERIE_UPDATE_REEXECED=1
  export MENAGERIE_UPDATE_REEXECED
  exec "$0" --force
fi

# Build first: if this fails, the old container keeps serving.
docker build -f deploy/Dockerfile -t menagerie-sync .

# Retire containers from before the rename. A box installed under the old name
# still has one bound to 8787, which would make the run below fail and leave
# the deploy wedged behind a server nobody can update.
docker rm -f moxy-sync >/dev/null 2>&1 || true
docker rm -f menagerie-sync >/dev/null 2>&1 || true

docker run -d --name menagerie-sync --restart unless-stopped \
  --label "menagerie.commit=$REMOTE" \
  -p 127.0.0.1:8787:8787 -v menagerie-sync-data:/data \
  -e MENAGERIE_TRUST_PROXY=1 menagerie-sync

sleep 2
curl -fsS http://127.0.0.1:8787/v2/health
echo " deployed $(git rev-parse --short HEAD)"
