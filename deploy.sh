#!/usr/bin/env bash
# Build locally and deploy to codev-app (agent-catalog.techtree.kr)
set -euo pipefail
cd "$(dirname "$0")"

HOST=codev-app
DIR=/var/www/codev

bun install --frozen-lockfile
bun run build

rsync -az --delete build/ "$HOST:$DIR/build/"
rsync -az package.json bun.lock "$HOST:$DIR/"

ssh "$HOST" "cd $DIR && bun install --production --frozen-lockfile --ignore-scripts && sudo systemctl restart codev && sleep 2 && systemctl is-active codev"
