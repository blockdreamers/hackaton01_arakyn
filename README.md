# codev (agent-catalog.techtree.kr)

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

Schema lives in `src/lib/server/db/schema.ts`. After changing it, generate a migration and commit it:

```sh
bun run db:generate   # writes SQL to drizzle/
bun run db:migrate    # apply locally (deploys also apply it)
bun run db:studio
```

## Auth

Google Identity Services sign-in. Set `GOOGLE_CLIENT_ID` (OAuth client, type "Web application") in `.env`.
Authorized JavaScript origins: `https://agent-catalog.techtree.kr`, `http://localhost:5173`.
The ID token is verified server-side (`/auth/google`), users and sessions are stored in Postgres.

## Scraper

Collects product name, price, list price, image URL, link and categories from shop listing pages into
`products`. Each shop is a row in `sites` with its country (ISO 3166-1, e.g. `KR`) and currency
(ISO 4217, e.g. `KRW`); prices are stored in the site's currency.

- Run from the CLI: `bun run scrape [site]` (default `iaansci`)
- Or press "다시 긁기" on `/dashboard` (runs in the background, progress in `scrape_runs`)

One request per second, identified as `AgentCatalogBot`, only robots.txt-allowed pages. Products
missing from a finished run are marked `active = false`. To add a shop, implement `SiteScraper`
in `src/lib/server/scraper/sources/` and register it in `src/lib/server/scraper/index.ts`.

## Deploy

Every push to `main` deploys via GitHub Actions (`.github/workflows/deploy.yml`). Manual deploy from a
machine with the `codev-app` SSH alias:

```sh
bun run deploy
```

Builds, rsyncs `build/`, `drizzle/` and package files to `codev-app:/var/www/codev`, runs
`bun run db:migrate` there, and restarts the `codev` systemd service. Runtime env lives in
`/var/www/codev/.env` on the server (`DATABASE_URL`, `GOOGLE_CLIENT_ID`, `HOST`, `PORT`).

Server layout: Cloudflare (proxied, Full strict) → nginx :443 (Let's Encrypt, Cloudflare real-IP,
unknown hosts dropped) → Bun :3000. adapter-node 6 derives the origin from the Host header (protocol
defaults to `https`), so `ORIGIN` is not used.
