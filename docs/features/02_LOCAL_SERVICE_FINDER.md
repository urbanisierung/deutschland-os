# Local Service Finder (Handwerker / Dienstleister Matching)

**Status:** Proposal · **Date:** 2026-06-22

Find the right local company for a concrete job — e.g. *"someone who installs a
Wärmepumpe in my home"* — and turn that search into finished, fundable quote
requests. This is the second Deutschland OS use case and reuses the entire
real-estate stack (resilient fetcher, JSON-LD scraper, Zod-structured LLM
generator, thin skill/web consumers).

## The core insight: Gemini + Google Maps answers the wrong question

Asking Gemini "who installs a Wärmepumpe near me" runs a Maps query and returns
a **ranked list of pins**: name, stars, distance, maybe a phone number. That is a
*directory lookup* — and for a Wärmepumpe in Germany it is exactly the weak spot:

- **German Handwerker have thin, stale Maps presence.** Many have no listing, no
  website, three reviews from 2019. Maps ranking is proximity + ad spend + review
  count, none of which predicts whether this Betrieb can do *your* job.
- **The bottleneck isn't finding names — it's the outcome:** a certified
  installer who (a) is eligible to sign the *Fachunternehmererklärung* required
  for BAFA/KfW funding, (b) has capacity this year, and (c) actually replies.
  Maps shows none of this.
- **The decision is funding-coupled.** A Wärmepumpe install is really a *subsidy*
  decision (BEG / KfW 458, up to ~70% Förderung). Whether a given installer keeps
  your funding eligible is structured, knowable data — and invisible on Maps.

The moat is **not a better map.** It is depth on German-specific structured data
plus turning a search into a finished, fundable request.

## Where the added value is (the moat)

### 1. German registries Google doesn't index

The hard-to-copy trust layer, cross-referenced into a single "certified +
funding-eligible + guild-backed" signal:

- **Energieeffizienz-Experten-Liste** (energie-effizienz-experten.de / dena) —
  the official list gating KfW/BAFA eligibility.
- **Handwerksrolle / Handwerkskammer** — registered Betrieb, Meisterbetrieb status.
- **Innung / SHK-Fachverband** (Sanitär-Heizung-Klima guild) membership.
- **Manufacturer Fachpartner finders** (Viessmann, Vaillant, Bosch, Daikin) — the
  installers actually trained on specific equipment.

### 2. Job-aware matching, not listing

Capture the actual job — Altbau/Neubau, beheizte Fläche, existing heating
(Gas/Öl), Vorlauftemperatur, available funding — and *score* each installer's
fit, exactly as `confidenceScore` / `shouldApply` does for listings. The output
is not a list; it is "these 3 fit, here's why, and this one risks your funding."

### 3. Close the loop: search → quotes

The genuine pain is getting a reply. Reuse the Anschreiben generator to produce a
structured **Anfrage / Leistungsbeschreibung**, send it to the top N matches, and
track responses — converting "I found some names" into "I have 3 Angebote."
Gemini fundamentally cannot do this.

## How it maps onto the existing stack

| Existing piece | Reused for service finder |
| --- | --- |
| `packages/shared/src/fetcher.ts` (rotating headers, retries, proxy gateway) | Pulling registry / directory / partner-finder pages resiliently |
| `packages/shared/src/scraper.ts` (JSON-LD + OG fallback) | Extracting `LocalBusiness` structured data per company |
| `packages/shared/src/generator.ts` (Zod structured LLM output) | Match-scoring + generating the Anfrage |
| Claude skill + Astro web app | Thin consumers, as today |
| Provider-agnostic LLM adapter (on roadmap) | Same |

### Schema sketch

In the spirit of the existing `types.ts`:

```ts
type ServiceRequest = {
  trade: "waermepumpe" | "pv" | "sanitaer";
  postalCode: string;
  building: {
    type: "altbau" | "neubau";
    heatedAreaM2: number;
    currentHeating: "gas" | "oel" | "nachtspeicher";
  };
  funding: { wantsKfW: boolean };
};

// Factual candidate, assembled by the data layer (Places API + registry enrichment)
type ProviderMatch = {
  name: string;
  location: { lat: number; lng: number };
  distanceKm: number;
  certifications: (
    | "energieeffizienz-experte"
    | "meisterbetrieb"
    | "innung-shk"
    | "vaillant-fachpartner"
  )[];
  fundingEligible: boolean; // ← the signal Maps lacks
};

// LLM output, mirroring ApplicationResponse (facts in, judgment + message out)
type ProviderInquiry = {
  subjectLine: string;
  inquiryMessage: string; // the ready-to-send Anfrage (formal "Sie")
  matchScore: number; // 0–100, like confidenceScore
  caveats: string[]; // "not on EE-Experten list → KfW at risk"
  shouldContact: boolean; // like shouldApply
};
```

> **Phase 1 note:** implemented in `packages/shared/src/service.ts` +
> `service-generator.ts`. The judgment fields (`matchScore`, `caveats`) live on
> the LLM output `ProviderInquiry`, not on the factual `ProviderMatch` candidate —
> keeping the data layer (facts) and the generator (judgment) cleanly separated,
> exactly as `Listing` → `ApplicationResponse`. `generateServiceRequest()` takes a
> `ServiceRequest` + a `ProviderMatch` and returns a validated `ProviderInquiry`.

## Data sourcing & legal stance

The differentiation *is* the data, and that is where the work and risk sit.

> **EE-Experten lookup (verified 2026-06):** the residential search is a
> multipart **POST** to
> `…/fuer-private-bauherren/finden-sie-experten-in-ihrer-naehe/suchergebnis`,
> filtered by company/surname + PLZ + radius (fields
> `tx_wwdenaexpertendb_qualification_suche[name|plz|umkreis]`). Results are
> `.expertendb_single` blocks (company in `.adresse strong`, city in `.adresse`).
> Implemented in `provider-enrichment.ts` via `createExpertSearch` +
> `enrichProviderFundingEligibility(candidate, plz, …)`. Name matching is
> normalized-containment (tolerant of legal-form/suffix differences); only the
> first results page is parsed.

**Clean sources (consult these first — they exist to be searched):**

- Energieeffizienz-Experten-Liste · Handwerkskammer directories ·
  manufacturer Fachpartner finders · Innungs-/Fachverband member lists.
- **Google Places API** (paid, ToS-compliant) as the base layer for "who exists +
  where." Enrich its results with the German registry layer — use Maps as input,
  not as the product.

**Grey-area directories (last-resort fallback only):**

- Branchenbücher: Das Örtliche, Gelbe Seiten, 11880, GoYellow, meinestadt.de.
- Review/lead platforms: ProvenExpert, Trustpilot DE, Yelp DE.
- Lead marketplaces: **MyHammer, Check24 Profis, Blauarbeit, Aroundhome** — avoid
  entirely (highest legal friction *and* direct competitors).

Why grey: explicit ToS bans on automated extraction; the German database right
(**§87b UrhG**) protects bulk extraction independent of copyright; **GDPR** —
a sole trader's business contact data is personal data (lawful basis under
Art. 6 + information duties under Art. 14). If a fallback is unavoidable, prefer
"follow the link to the business's own site and read what it publishes" over
bulk-extracting the directory's database.

**Outbound contact:** when sending Anfragen, **§7 UWG** constrains unsolicited B2B
contact. Prefer submitting the business's own contact form (a channel it put up
to receive enquiries) over cold email/fax.

## Recommended MVP slice

Don't boil the ocean. One trade (Wärmepumpe), one region, thin vertical:

1. Google Places (or a clean directory) → candidate list with geo.
2. Enrich against **one** authoritative registry — the Energieeffizienz-Experten-
   Liste — to set `fundingEligible`. That single field already beats Gemini.
3. LLM match-score + generate the Anfrage (reuse `generator.ts`).
4. Manual send for v1; automate the loop later.

This proves the moat (funding-eligibility data + finished Anfrage) with the least
new infrastructure.

## Action items

### Phase 0 — Decisions (resolved 2026-06-23)

- [x] **Data-source policy: official-only for v1.** Google Places API (clean base
      layer) + official registries only. Grey-area Branchenbücher and lead
      marketplaces are out of scope — the moat (funding eligibility +
      certifications) lives entirely in the clean sources, so the legal risk of
      scraping directories buys only marginal name coverage. Reversible: a safer
      "follow the link to the business's own site" fallback can be added later.
- [x] **Outbound: generate only for v1.** Produce a ready-to-send Anfrage; the
      user sends it. No automated outbound — keeps §7 UWG risk off the product,
      and the core value (matching + a polished job-specific Anfrage) is already
      delivered. Auto-send + response tracking stays Phase 4.
- [x] **Scope: Wärmepumpe, one metro region** (recommend Berlin or Munich — pick
      the region you can ground-truth yourself). Wärmepumpe maximizes the moat
      (most funding-coupled trade), and one trade keeps the trade-specific
      schema/scoring honest before generalizing to PV/Sanitär.

### Phase 1 — Schema & core

- [ ] Add `ServiceRequest` / `ProviderMatch` Zod schemas to `packages/shared`.
- [ ] Add a `generateServiceRequest()` generator (mirror `generateApplication()`)
      with an injectable model and unit tests.

### Phase 2 — Data layer

- [ ] Google Places API client for "who exists + where" (env-configured key).
- [ ] Energieeffizienz-Experten-Liste enricher (reuse `fetcher` + `scraper`),
      mapping each candidate to `fundingEligible` + certifications, with fixtures.
- [ ] Match-scoring pass that combines distance, certifications, and job fit.

### Phase 3 — Consumers

- [ ] Astro + Preact flow: job form → ranked `ProviderMatch` list with funding
      and caveat badges (mirror the real-estate UI).
- [ ] Claude skill `local-service-finder` wrapping the same core as a CLI.

### Phase 4 — Close the loop (optional v2)

- [ ] Generate the Anfrage per match (reuse the Anschreiben generator).
- [ ] Contact-form submission + response tracking (respecting §7 UWG).

### Cross-cutting

- [ ] Document GDPR / §87b UrhG / §7 UWG stance for any scraped source.
- [ ] Keep `packages/shared` provider-agnostic (no Claude-specific APIs).
- [ ] `biome check .`, `tsc --noEmit`, and Vitest green before each merge.
