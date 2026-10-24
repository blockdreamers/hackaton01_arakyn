#!/usr/bin/env bash
# Build locally and deploy to codev-app (agent-catalog.techtree.kr)
# Also run by .github/workflows/deploy.yml on every push to main.
set -euo pipefail
cd "$(dirname "$0")"

HOST=codev-app
DIR=/var/www/codev

bun install --frozen-lockfile
bun run build

rsync -az --delete build/ "$HOST:$DIR/build/"
rsync -az --delete drizzle/ "$HOST:$DIR/drizzle/"
rsync -az package.json bun.lock drizzle.config.ts "$HOST:$DIR/"

# full install (drizzle-kit is a dev dependency), apply migrations, restart
ssh "$HOST" "cd $DIR && bun install --frozen-lockfile --ignore-scripts \
	&& set -a && . ./.env && set +a && bun run db:migrate \
	&& sudo systemctl restart codev && sleep 2 && systemctl is-active codev"
