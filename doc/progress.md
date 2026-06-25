# Progress

## 2026-06-24 — Local Service Finder: Phase 3 (consumers)

Wired the service-finder core into a web flow and a Claude skill, mirroring the
real-estate consumers. Both are demoable now via manual provider entry; the
Places client (Phase 2) will feed candidates automatically later.

- Shared:
  - `service.ts` — added `ProviderCandidateSchema`/`ProviderCandidate` (a
    `ProviderMatch` before funding enrichment); `provider-enrichment.ts` now
    imports the type from here instead of defining it.
  - `request.ts` — `ServiceFinderRequestSchema` (`{ request, providers }`) wire
    contract for the endpoint.
  - `service-finder.ts` — `findAndDraft(request, providers, model)`: ranks, then
    drafts an Anfrage for the single top contactable provider (bounds LLM cost),
    returning the full ranked list either way. 2 tests.
- Web (`apps/web`):
  - `store/serviceStore.ts` — job form state + a pure `parseProviderLines()`
    that turns the manual textarea (`Name; km; ja/nein; certs`) into enriched
    `ProviderMatch[]`. 5 tests (incl. a regression: empty distance field must not
    parse as 0).
  - `pages/api/find-provider.ts` — validates, builds the OpenAI service model,
    runs `findAndDraft`.
  - `components/ServiceFinderForm.tsx` + `pages/service.astro` — job form,
    ranked list with funding/score/distance badges and caveats, and the drafted
    Anfrage. Reachable at `/service`.
- Skill (`packages/plugins/claude`):
  - `local-service-finder` (`SKILL.md` + `scripts/find.ts`) — full pipeline:
    enrich each candidate (EE-Experten), rank, draft. `--request`/`--candidates`
    (+ `--locality`, `--search-url`). Added the `find-provider` package script.
- Verification: `biome check .` clean, `turbo typecheck test build` all green
  (shared 106, web 7 tests).
- Marked both Phase 3 items done in `doc/roadmap.md`.

## 2026-06-24 — Local Service Finder: Phase 2 (match-scoring pass)

Added the deterministic pre-ranking that orders/filters enriched candidates
before any LLM call — the cheap, explainable layer beneath the generator.

- `provider-scoring.ts`:
  - `scoreProvider(request, provider)` → `{ score (0–100), shouldContact,
    caveats, factors }`. Weighted blend of funding fit (0.45 — leads, since it's
    the signal Maps lacks), distance decay (0.30, linear to 0 at 50 km), and
    trust certifications (0.25, saturating at 3, excluding the funding cert).
    KfW wanted but not funding-eligible → funding factor 0, critical caveat,
    `shouldContact: false`. German caveats for funding risk, out-of-area
    (>30 km), and no known certifications.
  - `rankProviders(request, providers)` → best-first, ties broken by distance
    then name. Pure (no clock/randomness) so order is stable across runs.
- `provider-scoring.test.ts` — 8 tests (scoring components, funding-not-wanted
  neutrality, distance decay, caveats, cert saturation, deterministic ranking).
  Full shared suite: 102/102 pass.
- Exported the new symbols from `index.ts`.
- Verification: `biome check .` clean, `turbo typecheck test` 6/6 pass.
- Marked the match-scoring item done in `doc/roadmap.md`. Phase 2 now has only
  the Google Places client (needs an API key) outstanding.

## 2026-06-24 — Local Service Finder: Phase 2 (funding-eligibility enricher)

Added the Energieeffizienz-Experten-Liste enricher — the step that turns a raw
"exists here" candidate into a provider we know can keep a KfW/BAFA application
eligible (the signal Google Maps lacks).

- `provider-enrichment.ts`:
  - `ProviderCandidate` — a `ProviderMatch` before funding enrichment (Places
    API output).
  - Pure, fixture-tested helpers: `normalizeCompanyName` (folds umlauts/ß, strips
    German legal forms), `parseExpertEntries` (results HTML → entries),
    `matchExpertEntry` (normalized either-direction containment + locality
    disambiguation), `buildExpertSearchUrl`.
  - `enrichProviderFundingEligibility` — fetches the EE-Experten search (reusing
    the env-configured resilient fetcher; injectable for tests), and on a match
    sets `fundingEligible: true` + adds the `energieeffizienz-experte` cert. A
    failed/empty lookup yields `fundingEligible: false` rather than throwing, so
    one bad lookup can't sink a batch. Output validated as `ProviderMatch`.
  - The live DOM/endpoint can't be verified from here, so selectors + the search
    URL are marked PROVISIONAL (validate against the live site before production),
    consistent with the per-portal selector work tracked for the listing scraper.
- `provider-enrichment.test.ts` — 12 tests (normalization, parsing, matching,
  URL build, enrichment match/miss/error/dedupe). Full shared suite: 74/74 pass.
- Exported the new symbols from `index.ts`.
- Verification: `biome check .` clean, `turbo typecheck test` 6/6 pass.
- Marked the enricher done in `doc/roadmap.md` (Phase 2 still has the Places
  client and match-scoring pass outstanding).

## 2026-06-24 — Local Service Finder: Phase 1 (schema & core)

Implemented the second use case's core in `@deutschland-os/shared`, mirroring the
real-estate `types.ts` / `generator.ts` split. No platform consumers yet.

- `service.ts` — Zod schemas + inferred types:
  - `ServiceRequest` (the job: trade, German PLZ, building, funding intent, notes),
    `ProviderMatch` (factual candidate: name, geo, distance, certifications,
    `fundingEligible`), and `ProviderInquiry` (LLM output: subject, Anfrage,
    `matchScore`, `caveats`, `shouldContact`). Judgment fields live on the output,
    not the candidate — same facts-in/judgment-out shape as `ApplicationResponse`.
- `service-generator.ts` — `generateServiceRequest()` with an injectable
  `ServiceModel`; `createOpenAIServiceModel()` wires LangChain + `gpt-4o-mini`
  native structured output. Prompt built directly (no template interpolation) so
  scraped provider text can't break it. The system prompt enforces formal "Sie",
  asks for an Angebot, and ties `shouldContact = false` to missing KfW eligibility.
- `service-generator.test.ts` — prompt rendering + input/output validation (8
  tests). Full shared suite: 62/62 pass.
- Exported all new symbols from `index.ts`.
- Verification: `biome check .` clean, `turbo typecheck test` 6/6 pass.
- Marked Phase 1 done in `doc/roadmap.md`; aligned the schema sketch in
  `docs/features/02_LOCAL_SERVICE_FINDER.md` with the implemented split.

## 2026-06-23 — Local Service Finder: Phase 0 decisions resolved

- Recorded the three blocking Phase 0 decisions in `doc/roadmap.md` and
  `docs/features/02_LOCAL_SERVICE_FINDER.md`:
  - Data-source policy: **official-only for v1** (Places API + official
    registries); grey-area directories and lead marketplaces out of scope.
  - Outbound: **generate only for v1** (user sends the Anfrage); auto-send stays
    Phase 4 to avoid §7 UWG risk.
  - Scope: **Wärmepumpe, one metro region** (Berlin or Munich).
- Unblocks Phase 1 (schemas + `generateServiceRequest()`).

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
