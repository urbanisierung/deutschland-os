# Progress

## 2026-06-22 — Local Service Finder proposal

- Added `docs/features/02_LOCAL_SERVICE_FINDER.md`: a proposal for the second use
  case — matching a concrete job (e.g. Wärmepumpe install) to the right local
  company. Covers why Gemini + Google Maps falls short, the moat (German
  registries: Energieeffizienz-Experten-Liste, Handwerksrolle, Innung,
  manufacturer Fachpartner lists), how it reuses the existing fetcher/scraper/
  generator stack, a `ServiceRequest`/`ProviderMatch` schema sketch, the data
  sourcing & legal stance (clean vs. grey-area sources; §87b UrhG, GDPR, §7 UWG),
  an MVP slice, and phased action items. No code changes yet — proposal only.

## 2026-05-30 — Scraper reliability & anti-blocking

Added a resilient, pluggable HTTP layer so listings can be fetched reliably and
the scraper avoids being blocked.

- New `packages/shared/src/fetcher.ts`:
  - `createResilientFetcher` — rotating realistic browser headers/User-Agents,
    per-request timeout (`AbortSignal`), and retries with jittered exponential
    backoff that honors `Retry-After`. All nondeterminism (sleep, jitter, clock,
    UA order) is injectable for deterministic tests.
  - `createGateway` / `createFetcherFromEnv` — route requests through a proxy or
    managed scraping API (residential IPs, JS rendering, CAPTCHA) via a
    `{url}`/`{key}` template; configured by `SCRAPER_*` env vars with no code
    change. This is the lever for getting past DataDome-class protection.
  - `withCache` — TTL cache of successful responses for availability + lower
    request volume.
- `scrapeListing` now defaults to the env-configured resilient fetcher; the
  injectable `fetchImpl` is retained for tests.
- Added `fetcher.test.ts` (header/UA rotation, retry/backoff, Retry-After,
  gateway templating, cache hit/expiry, env wiring) — 36 shared tests pass.
- Honest scope note: true "never blocked" against DataDome requires the gateway
  (proxies/managed API); documented in `doc/scraping.md`.
- Documented config + recommended setups in `doc/scraping.md` and
  `apps/web/.env.example`.

## 2026-05-30 — Scraping documentation

- Added `doc/scraping.md` documenting how the listing scraper works (fetch →
  Cheerio parse → JSON-LD-first extraction with Open Graph/meta fallback →
  German number normalization → Zod validation), its limitations, and how to
  deploy it via the web app (standalone Node server, Docker, env vars) or the
  Claude skill CLI.
- Linked the new doc from `README.md`.

## 2026-05-30 — Real estate use case (initial implementation)

Bootstrapped the monorepo and implemented the first use case end to end.

### Monorepo scaffold
- Turborepo workspace (`apps/*`, `packages/shared`, `packages/plugins/*`).
- Shared config: root `tsconfig.base.json` (strict), `biome.json` (single
  formatter/linter), `turbo.json` pipeline.
- Standardized on TypeScript 5.9.x (Astro tooling does not yet support TS 6).

### `@deutschland-os/shared` (core)
- `types.ts` — Zod schemas + inferred types for `UserProfile`, `Listing`,
  `ApplicationResponse`.
- `generator.ts` — `generateApplication()` orchestration with an injectable
  `ApplicationModel`; `createOpenAIApplicationModel()` wires LangChain +
  `gpt-4o-mini` with native structured output. Prompt built directly (no
  template interpolation) so scraped text cannot break it.
- `scraper.ts` — `parseListingHtml()` / `scrapeListing()` using Cheerio, with
  JSON-LD first and Open Graph/meta fallbacks; `parseGermanNumber()` helper.
- `request.ts` — shared `GenerateRequest` wire contract.
- Unit tests (Vitest) for the generator (mocked model), scraper (HTML
  fixtures), and number parsing.

### `apps/web` (Astro + Preact)
- Server-rendered Astro app with the Node adapter and Preact (`compat: true`).
- `POST /api/generate` — validates input, scrapes when given a URL, runs the
  generator, returns `{ listing, result }`.
- Zustand store + `ApplicationForm` island: profile fields, URL/manual listing
  toggle, result rendering with red-flag and apply/no-apply badges.
- Vitest config aliases React → preact/compat for store tests.

### `packages/plugins/claude`
- `real-estate-application` skill: `SKILL.md` + `generate.ts` CLI wrapping the
  shared core (`--profile` + `--url` | `--listing`).

### Verification
- `biome check .` — clean.
- `turbo build typecheck test` — 7/7 tasks pass.
