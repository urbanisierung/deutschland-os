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
