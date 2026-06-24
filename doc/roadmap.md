# Roadmap

## E-invoicing use case (planned)

Chosen as use case #2. Rationale and scope boundaries in
[`doc/eu-compliance-radar.md`](eu-compliance-radar.md). Build the documents
(generate / validate / parse), not the Peppol network.

- [ ] EN 16931 invoice model (Zod) in `packages/shared/src/einvoice/`
- [ ] CII serializer → XRechnung XML, validated against the KoSIT validator in CI
- [ ] Incoming parser (XRechnung → normalized invoice) — covers the 2025
      "must receive" obligation
- [ ] ZUGFeRD hybrid PDF (embed CII in PDF/A-3 via pdf-lib)
- [ ] Web view (`/invoice`): form → download XRechnung/ZUGFeRD; drop-and-validate
- [ ] Claude `einvoice` skill (build / validate / parse)
- [ ] Optional LLM edges: extract invoice from scanned PDF; explain an invoice

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
