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

Collects product name, price, image URL, link, brand and categories from shop listing pages into
`products`. Each shop is a row in `sites` with its country (ISO 3166-1, e.g. `KR`) and currency
(ISO 4217, e.g. `KRW`); prices are stored in the site's currency.

| site                             | listing                                                     | size (Oct 2026)                            | delay |
| -------------------------------- | ----------------------------------------------------------- | ------------------------------------------ | ----- |
| `iaansci` (이안과학, Cafe24)     | `/product/list.html?cate_no=N&page=P`                       | ~24k products, ~700 pages, ~12 min         | 1 s   |
| `navimro` (나비엠알오)           | `/s/c-NN/page-P/?hits=90`                                   | ~2.07M products, ~23k pages (~2 MB each)   | 2 s   |
| `officedepot` (오피스디포)       | `/cate/cateItemList.do?cateId=N&rowLevel=1&currentPageNo=P` | ~31k products, ~530 pages                  | 1.5 s |
| `daiso` (다이소, KR)             | daiso-mcp `GET /api/daiso/products?q=`                      | keyword search, 100/page, ≤3 pages/keyword | 2 s   |
| `daiso_jp` (DAISO Japan, JP/JPY) | daiso-mcp `GET /api/daiso-jp/products?q=`                   | keyword search, 24/page, ≤3 pages/keyword  | 2 s   |

Daiso goes through the public [daiso-mcp](https://github.com/hmmhmmhm/daiso-mcp) API
(`https://mcp.aka.page`), a shared free service, so it runs slowly and only a few pages per keyword.
Default keywords are the 100 MRO terms in Korean / Japanese (`src/lib/server/scraper/keywords/mro.ts`);
any keywords can be passed instead. Keyword sources store the search term in `products.keywords`.

- CLI: `bun run scrape <site> [--categories c-23,c-24 | --categories 육각볼트,베어링] [--max-pages 10]`
- Or `/nimda` (admin only): pick site and optional range, runs in the background, progress in `scrape_runs`

Only robots.txt-allowed pages, identified as `AgentCatalogBot`. Products are saved page by page.
A full run marks products it didn't see `active = false`; a run limited by categories or pages
only adds data. A server restart (e.g. a deploy) stops a running scrape; it is marked failed after
24 h, or can be re-run right away from the CLI. To add a shop, implement `SiteScraper` in
`src/lib/server/scraper/sources/` and register it in `src/lib/server/scraper/index.ts`.

## API

Users issue an API key on `/dashboard` (shown once, stored hashed) and call the API with
`Authorization: Bearer <key>`. Every call is logged in `api_requests` and shown on the dashboard.

- `GET /api/v1/products?q=&country=&site=&limit=&offset=`
- `GET /api/v1/sites`

## Admin

`/nimda` (scrape status and trigger) is only visible to emails in `src/lib/server/admin.ts`;
everyone else gets a 404.

## Amazon (Bright Data)

"Amazon products - discover by keyword" (`gd_l7q7dkf244hwjntr0`), billed per record. Needs
`BRIGHTDATA_API_TOKEN` in `.env`. Keywords are in `scripts/amazon-keywords.txt`.

```sh
bun run amazon trigger --keywords "microscope" --limit-per-keyword 3 --max-total 3   # cheap test
bun run amazon trigger                 # all keywords, <= 90 per keyword, <= 9500 total
bun run amazon collect                 # waits for the snapshot, stores products (site amazon_us, US/USD)
```

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
