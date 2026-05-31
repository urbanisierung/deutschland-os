# Scraping

How listing acquisition works in Deutschland OS, and how to deploy the parts
that run it.

## Overview

The scraper turns a **listing URL** into a normalized `Listing` object that the
application generator consumes. It is a server-side, fetch-and-parse scraper:
it downloads the listing's HTML over HTTP and extracts structured fields. The
HTTP layer is resilient by default (rotating browser headers, timeouts, retries,
optional caching) and can be routed through a proxy / managed scraping API to
handle JS rendering and advanced bot protection — see
[Reliability & anti-blocking](#reliability--anti-blocking).

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
scrapeListing(url, fetchImpl?)
```

`scrapeListing` fetches the URL via a `fetchImpl`. When none is passed it uses
the **resilient, anti-blocking fetcher** built by `createFetcherFromEnv()` (see
[Reliability & anti-blocking](#reliability--anti-blocking)); tests inject a stub
to supply canned HTML without network access. A non-`2xx` response throws
`Failed to fetch listing (<status>): <url>`. The HTML body is handed to
`parseListingHtml`.

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
     ├─ resilient fetcher            (headers/UA rotation, timeout, retries, cache)
     │    └─ optional gateway        (proxy / managed scraping API) → HTML
     └─ parseListingHtml(html, url)
         ├─ Cheerio.load(html)
         ├─ extractFromJsonLd(collectJsonLd($))   (preferred)
         ├─ extractFromMeta($)                     (fallback)
         └─ ListingSchema.parse(merged)            → Listing
```

## Reliability & anti-blocking

> **Honest expectation:** no purely self-hosted scraper can guarantee it is
> *never* blocked. Advanced bot protection — notably **DataDome**, used by
> ImmoScout24 — relies on TLS fingerprinting, IP reputation, JavaScript
> challenges, and thousands of per-site ML models. Defeating it reliably
> requires **rotating residential proxies + a real/automated browser
> fingerprint**, which in practice means routing through a **managed scraping
> API** (or a headless browser). The code below maximizes reliability and makes
> that routing a one-line configuration change.

The default fetcher (`packages/shared/src/fetcher.ts`, used automatically by
`scrapeListing`) layers several defenses, all individually testable because
every nondeterministic input (sleep, jitter, clock, UA order) is injected:

1. **Realistic, rotating browser fingerprints.** Each request sends a full set
   of desktop navigation headers (`Accept`, `Accept-Language: de-DE…`,
   `Sec-Fetch-*`, `Upgrade-Insecure-Requests`) and rotates the `User-Agent`
   round-robin across a pool of current Chrome/Firefox/Safari strings, so
   traffic does not present a single static fingerprint.
2. **Timeouts.** Every request is bounded by an `AbortSignal` (default 15 s) so
   a hung connection can't stall the pipeline.
3. **Retries with backoff.** Transient failures (network errors and
   `408/425/429/500/502/503/504`) are retried with jittered exponential backoff.
   A `Retry-After` header is honored when present, so rate-limit windows are
   respected rather than hammered.
4. **Caching (optional).** `withCache` stores successful responses for a TTL,
   keyed by URL. This serves listing data even during brief origin outages or
   rate-limit windows, and cuts request volume — which itself lowers the chance
   of being flagged.
5. **Pluggable gateway — the decisive lever.** `createGateway` rewrites each
   request through a proxy or managed scraping API via a URL template. Point it
   at a provider that supplies **residential IPs, JS rendering, and CAPTCHA
   solving** and you get past DataDome-class protection without touching code.

### Configuration

All knobs are environment variables, read by `createFetcherFromEnv()` at
runtime — no code change or redeploy of the app image required:

| Variable                   | Purpose                                                            |
| -------------------------- | ----------------------------------------------------------------- |
| `SCRAPER_GATEWAY_TEMPLATE` | Proxy / scraping-API URL template containing `{url}` (and `{key}`). |
| `SCRAPER_API_KEY`          | Key substituted for `{key}` in the template.                      |
| `SCRAPER_TIMEOUT_MS`       | Per-request timeout (default `15000`).                            |
| `SCRAPER_RETRIES`          | Retry attempts after the first try (default `3`).                 |
| `SCRAPER_CACHE_TTL_MS`     | Cache successful fetches for this many ms (`0`/unset = disabled). |

Example gateway templates (the provider handles proxies, rendering, CAPTCHA):

```
# ScraperAPI
SCRAPER_GATEWAY_TEMPLATE=https://api.scraperapi.com/?api_key={key}&url={url}&render=true
# ScrapingBee
SCRAPER_GATEWAY_TEMPLATE=https://app.scrapingbee.com/api/v1/?api_key={key}&url={url}&render_js=true
# ZenRows
SCRAPER_GATEWAY_TEMPLATE=https://api.zenrows.com/v1/?apikey={key}&url={url}&js_render=true
SCRAPER_API_KEY=your-provider-key
```

A plain HTTP/SOCKS proxy that forwards by query string works too — anything you
can express as a URL template. To use a custom provider/proxy from code instead,
call `createResilientFetcher({ gateway })` and pass the fetcher to
`scrapeListing(url, fetcher)`.

### Recommended setup for "always fetchable"

- **General portals (JSON-LD/OG available):** the built-in defaults are usually
  enough; optionally set `SCRAPER_CACHE_TTL_MS` for resilience.
- **DataDome-protected portals (ImmoScout24):** set `SCRAPER_GATEWAY_TEMPLATE`
  + `SCRAPER_API_KEY` to a managed scraping API with residential proxies and JS
  rendering. This is what makes fetches succeed consistently.

### Remaining constraints

- **JS-only data without a gateway.** The base fetcher does not execute
  JavaScript. Listings whose data is injected client-side need a JS-rendering
  gateway (the providers above render the page server-side).
- **Generic extraction.** Field coverage still depends on the portal's
  structured data; portal-specific extractors remain on the roadmap.
- **Legal/ToS.** A gateway removes the technical block, not the legal one.
  Respect each portal's Terms of Service and `robots.txt`, keep volume modest,
  and ensure you have the right to use the data.

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

Plus the scraper reliability variables from
[Configuration](#configuration) (`SCRAPER_GATEWAY_TEMPLATE`, `SCRAPER_API_KEY`,
`SCRAPER_TIMEOUT_MS`, `SCRAPER_RETRIES`, `SCRAPER_CACHE_TTL_MS`). For
DataDome-protected portals, set the gateway variables.

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
