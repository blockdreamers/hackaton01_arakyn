# codev (mlc.techtree.kr)

SvelteKit 3 + Drizzle(PostgreSQL), managed and run with [Bun](https://bun.sh).

## Development

```sh
bun install
cp .env.example .env   # set DATABASE_URL
bun run dev
```

## Build & run

```sh
bun run build      # vite build (Vite itself runs on Node, see below)
bun run start      # runs build/index.js on Bun
```

`bun --bun vite build` doesn't work: SvelteKit analyses routes in a `worker_threads` worker that calls
`process.exit()`, and Bun exits the whole process instead of just the worker, so the build stops after
"Analysing routes". Only the build step uses Node; installs and the production server use Bun.

## Database

```sh
bun run db:push    # sync schema to DATABASE_URL
bun run db:studio
```

## Deploy

```sh
bun run deploy
```

Builds locally, rsyncs `build/` + `package.json` + `bun.lock` to `codev-app:/var/www/codev`, runs
`bun install --production` there, and restarts the `codev` systemd service.

Server layout: Cloudflare (proxied) → nginx :443 (Let's Encrypt cert, Cloudflare real-IP) → Bun :3000.
