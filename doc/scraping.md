# Scraping

How listing acquisition works in Deutschland OS, and how to deploy the parts
that run it.

## Overview

The scraper turns a **listing URL** into a normalized `Listing` object that the
application generator consumes. It is a server-side, fetch-and-parse scraper —
it downloads the listing's HTML over HTTP and extracts structured fields. It
does **not** run a headless browser and does **not** execute the page's
JavaScript.

All scraping logic lives in one place: `packages/shared/src/scraper.ts`. Two
entry points expose it:

- **Web app** — `POST /api/generate` (`apps/web/src/pages/api/generate.ts`)
  calls `scrapeListing(url)` when the request's source is a URL.
- **Claude skill** — the CLI at
  `packages/plugins/claude/skills/real-estate-application/scripts/generate.ts`
  calls `scrapeListing(url)` when run with `--url`.

There is no standalone scraping service; scraping is embedded in whichever of
those two hosts you deploy.

## How it works

### 1. Fetch

```
scrapeListing(url, fetchImpl = fetch)
```

`scrapeListing` performs a single HTTP GET via the injected `fetchImpl`
(defaults to the platform `fetch`). A non-`2xx` response throws
`Failed to fetch listing (<status>): <url>`. The raw HTML body is then handed to
`parseListingHtml`.

`fetchImpl` is injectable purely so tests can supply canned HTML without network
access (see `scraper.test.ts`). In production the global `fetch` is used as-is.

### 2. Parse

```
parseListingHtml(html, url) -> Listing
```

The HTML is loaded with [Cheerio](https://cheerio.js.org/) (a server-side,
jQuery-like HTML parser). Extraction runs two strategies and merges them, with
**JSON-LD taking priority** over meta tags:

#### Strategy A — JSON-LD (preferred)

Most German portals embed [schema.org](https://schema.org) structured data in
`<script type="application/ld+json">` blocks. `collectJsonLd` gathers every such
block, tolerates both single objects and arrays, and also descends into any
`@graph` arrays. Malformed JSON blocks are skipped silently (they are common).

`extractFromJsonLd` then reads, taking the first non-empty value across all
nodes:

| Listing field   | JSON-LD source                                          |
| --------------- | ------------------------------------------------------- |
| `title`         | `name` ?? `headline`                                    |
| `description`   | `description`                                           |
| `coldRent`      | `price` ?? `offers.price` ?? `priceSpecification.price` |
| `squareMeters`  | `floorSize.value` ?? `floorSize`                        |
| `district`      | `address.addressLocality` ?? `addressRegion` ?? `address` |
| `amenities`     | `amenityFeature[].name`                                 |

#### Strategy B — Open Graph / meta (fallback)

When JSON-LD is missing a field, `extractFromMeta` falls back to:

- `title` — `og:title` ?? `<title>` ?? first `<h1>`
- `description` — `og:description` ?? `<meta name="description">`

#### Number normalization

German listings format numbers like `1.150,00 €` and `78 m²`.
`parseGermanNumber` strips whitespace, isolates the numeric token, removes the
thousands `.`, converts the decimal `,` to `.`, and parses a float. Non-numeric
inputs (e.g. `"auf Anfrage"`) yield `null`.

### 3. Normalize & validate

The merged fields are parsed through `ListingSchema` (Zod), which fills defaults
and enforces types. The result always carries the source `url`. Two rules worth
knowing:

- **`title` is mandatory.** If neither strategy finds a title, parsing throws —
  a listing with no title is treated as a failed scrape.
- **`additionalCosts` (Nebenkosten) is always `null`** from scraping. It is not
  reliably present in structured data, so the generator renders it as “k. A.”
  unless the user supplies it via the manual entry path.

### Data flow

```
URL
 └─ scrapeListing(url)
     ├─ fetch(url)            → HTML
     └─ parseListingHtml(html, url)
         ├─ Cheerio.load(html)
         ├─ extractFromJsonLd(collectJsonLd($))   (preferred)
         ├─ extractFromMeta($)                     (fallback)
         └─ ListingSchema.parse(merged)            → Listing
```

## Limitations

This is a deliberately simple scraper. Know its boundaries before relying on it:

- **No JavaScript rendering.** Listings rendered entirely client-side won't
  expose data unless they also ship JSON-LD or OG tags (most portals do).
- **No bot-protection handling.** Portals like ImmoScout24 often gate pages
  behind CAPTCHAs / DataDome. A plain `fetch` may receive a challenge page
  instead of the listing, which will usually fail the title check and throw.
- **No retries, no caching, no rate limiting** are built in.
- **No custom `User-Agent`.** Requests go out with the runtime's default.
- **Generic, not portal-specific.** Field coverage depends on what the portal
  publishes as structured data. Portal-specific extractors are on the roadmap.

If you scrape, respect each portal's Terms of Service and `robots.txt`, and keep
request volume low and human-paced.

## Deploying the scraper

Because the scraper is embedded, you deploy it by deploying one of its two
hosts.

### Option A — Web app (recommended)

The web app is a server-rendered Astro site using the standalone Node adapter
(`apps/web/astro.config.mjs`: `output: "server"`, `@astrojs/node` in
`standalone` mode). Scraping runs inside the `/api/generate` route on the
server, so the URL is fetched from your server's IP — never the browser.

**Build:**

```bash
npm install
npm run build            # turbo build → apps/web/dist/
```

**Run:**

```bash
cd apps/web
HOST=0.0.0.0 PORT=4321 OPENAI_API_KEY=sk-... node ./dist/server/entry.mjs
```

**Environment variables:**

| Variable         | Required | Purpose                                        |
| ---------------- | -------- | ---------------------------------------------- |
| `OPENAI_API_KEY` | yes      | Used by the generator after scraping succeeds. |
| `OPENAI_MODEL`   | no       | Overrides the default `gpt-4o-mini`.           |
| `HOST`           | no       | Bind address (default `localhost`).            |
| `PORT`           | no       | Listen port (default `4321`).                  |

**Docker:**

```dockerfile
FROM node:22-slim AS build
WORKDIR /app
COPY . .
RUN npm install && npm run build

FROM node:22-slim
WORKDIR /app/apps/web
ENV HOST=0.0.0.0 PORT=4321 NODE_ENV=production
COPY --from=build /app/apps/web/dist ./dist
COPY --from=build /app/node_modules /app/node_modules
EXPOSE 4321
CMD ["node", "./dist/server/entry.mjs"]
```

Provide `OPENAI_API_KEY` at runtime (e.g. `docker run -e OPENAI_API_KEY=...`),
not in the image. Put the container behind a reverse proxy (TLS, timeouts) for
public deployments.

> **Platform note:** the scraper makes outbound HTTP requests. Serverless and
> edge hosts often restrict arbitrary outbound fetches and impose short
> execution limits — a long scrape + LLM call can exceed them. A long-running
> Node container (the standalone server above) is the most predictable target.

### Option B — Claude skill CLI

Run the scraper ad hoc, no web server:

```bash
export OPENAI_API_KEY=sk-...
cd packages/plugins/claude
node --experimental-strip-types \
  skills/real-estate-application/scripts/generate.ts \
  --profile ./profile.json \
  --url "https://www.immobilienscout24.de/expose/12345"
```

It prints `{ listing, result }` as JSON. This is the simplest way to deploy
scraping into a cron job or batch pipeline. Same `OPENAI_API_KEY` /
`OPENAI_MODEL` variables apply.

## Operational tips

- **Timeouts:** wrap deployments behind a proxy with sensible request timeouts;
  a slow portal plus an LLM call can take several seconds.
- **Rate limiting:** add throttling at the proxy or caller level if you scrape
  in bulk.
- **Failure modes:** scrape failures surface as `422` from `/api/generate`
  (`Could not load listing: …`). The manual-entry path is the fallback when a
  portal blocks scraping.
