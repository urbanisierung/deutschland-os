# Roadmap

## Real estate use case

### Done
- [x] Monorepo scaffold (Turborepo, Biome, Vitest, strict TS)
- [x] Core schemas (`UserProfile`, `Listing`, `ApplicationResponse`)
- [x] Application generator (LangChain + OpenAI structured output)
- [x] Listing scraper (JSON-LD + Open Graph/meta fallback)
- [x] Web app (Astro + Preact + Zustand) with `/api/generate`
- [x] Claude skill wrapping the core
- [x] Unit tests for core logic
- [x] Resilient fetch layer (rotating headers/UA, timeout, retries + backoff,
      caching) with a pluggable proxy / scraping-API gateway for anti-blocking

### Next
- [ ] Portal-specific scrapers (ImmoScout24, Immowelt, Kleinanzeigen) with
      resilient selectors and per-portal fixtures
- [ ] Profile persistence (save/load) in the web app
- [ ] Notification pipeline that consumes `shouldApply` to surface only
      worthwhile listings
- [ ] Provider-agnostic LLM adapter (add a Claude/Anthropic backend alongside
      OpenAI) so `packages/shared` stays portable
- [ ] Generate the full application as a downloadable PDF/letter
- [ ] E2E test for the web flow

## Local service finder use case

Match a concrete job (e.g. Wärmepumpe install) to the right local company.
See [`docs/features/02_LOCAL_SERVICE_FINDER.md`](../docs/features/02_LOCAL_SERVICE_FINDER.md)
for the full proposal.

### Phase 0 — Decisions (blocking, before code)
- [ ] Confirm data-source policy: official-only vs. include grey-area
      directories as a fallback
- [ ] Decide whether v1 sends the Anfragen or only generates them
- [ ] Confirm initial trade + region scope (recommend Wärmepumpe + one PLZ area)

### Phase 1 — Schema & core
- [ ] Add `ServiceRequest` / `ProviderMatch` Zod schemas to `packages/shared`
- [ ] Add a `generateServiceRequest()` generator (mirror `generateApplication()`)
      with an injectable model and unit tests

### Phase 2 — Data layer
- [ ] Google Places API client for "who exists + where" (env-configured key)
- [ ] Energieeffizienz-Experten-Liste enricher (reuse `fetcher` + `scraper`)
      mapping each candidate to `fundingEligible` + certifications, with fixtures
- [ ] Match-scoring pass combining distance, certifications, and job fit

### Phase 3 — Consumers
- [ ] Astro + Preact flow: job form → ranked `ProviderMatch` list with funding
      and caveat badges (mirror the real-estate UI)
- [ ] Claude skill `local-service-finder` wrapping the same core as a CLI

### Phase 4 — Close the loop (optional v2)
- [ ] Generate the Anfrage per match (reuse the Anschreiben generator)
- [ ] Contact-form submission + response tracking (respecting §7 UWG)

### Cross-cutting
- [ ] Document GDPR / §87b UrhG / §7 UWG stance for any scraped source
- [ ] Keep `packages/shared` provider-agnostic (no Claude-specific APIs)
