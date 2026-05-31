# Features

## Rental application generator — 2026-05-30

The first Deutschland OS use case.

- **Tailored Anschreiben generation** — formal "Sie"-form German cover letter +
  subject line, generated from a user profile and a property listing via
  LangChain + OpenAI structured output.
- **Red-flag pre-filtering** — detects problematic listings (Tauschwohnung,
  Indexmiete/Staffelmiete, missing kitchen, short-term sublets, explicit
  exclusions) and returns a `shouldApply` verdict plus a 0–100 confidence score.
- **Listing acquisition** — scrape a listing URL (JSON-LD with Open Graph/meta
  fallback) or supply structured listing data directly.
- **Web UI** — Astro + Preact form with profile inputs, URL/manual listing
  toggle, and a result view with apply/no-apply and confidence badges.
- **Claude skill** — `real-estate-application` skill exposing the same core as a
  CLI, designed to be portable to other AI platforms.
