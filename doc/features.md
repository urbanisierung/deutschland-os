# Features

## Local service finder — 2026-06-24

Match a concrete job (e.g. Wärmepumpe install) to the right local Betrieb. The
second Deutschland OS use case; see
[`docs/features/02_LOCAL_SERVICE_FINDER.md`](../docs/features/02_LOCAL_SERVICE_FINDER.md).

- **Funding-eligibility enrichment** — checks each company against the
  Energieeffizienz-Experten-Liste (the register that gates KfW/BAFA funding) —
  the signal Google Maps lacks. (Live POST endpoint + selectors verified.)
- **Deterministic ranking** — scores candidates 0–100 by funding fit, distance,
  and certifications, with German caveats; ranking is stable across runs.
- **Drafted Anfrage** — generates a formal "Sie"-form inquiry for the top
  contactable Betrieb (LangChain + OpenAI structured output).
- **Web UI** — `/service` page: job form + manual provider entry → ranked list
  with funding/score/distance badges and the drafted Anfrage.
- **Claude skill** — `local-service-finder` runs the full pipeline (enrich →
  rank → draft) as a portable CLI.
- **Pending** — Google Places client to discover candidates automatically
  (Phase 2); until then candidates are entered manually.

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
