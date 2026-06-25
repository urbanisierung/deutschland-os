---
name: local-service-finder
description: >-
  Find the right local trade company (Handwerksbetrieb) for a concrete job in
  Germany — e.g. installing a Wärmepumpe — and draft the inquiry. Use when the
  user wants to find/compare installers or Betriebe for a heating, PV, or
  Sanitär job, check who can keep KfW/BAFA funding eligible, or generate an
  Anfrage to send to a company.
---

# Local Service Finder

Ranks local trade companies for a concrete job and drafts the inquiry (Anfrage)
to the best contactable one. The differentiator over a plain Maps lookup is
**funding eligibility**: each Betrieb is checked against the
Energieeffizienz-Experten-Liste, which gates KfW/BAFA (BEG) funding.

Returns:

- `ranked` — every candidate scored 0–100 (funding fit, distance,
  certifications) with German caveats, best first
- `topInquiry` — a ready-to-send Anfrage (subject + formal "Sie" message) for
  the top provider worth contacting, or `null` if none qualifies

## When to use

Trigger when the user wants to find, compare, or contact a local Betrieb for a
trade job (Wärmepumpe, PV, Sanitär) — especially when KfW/BAFA funding matters.

## Inputs

1. **Request** — a JSON file matching `ServiceRequestSchema` (trade, PLZ,
   building, funding intent, notes).
2. **Candidates** — a JSON array matching `ProviderCandidateSchema` (e.g. from
   the Places API): each has a name, location, and distance. Funding eligibility
   is determined by the script, not supplied.

## How to run

```bash
export OPENAI_API_KEY=sk-...
node --experimental-strip-types \
  skills/local-service-finder/scripts/find.ts \
  --request ./request.json \
  --candidates ./candidates.json \
  --locality Berlin \
  --umkreis 10
```

Eligibility is checked against the Energieeffizienz-Experten-Liste around the
request's PLZ within `--umkreis` km (default 10). The script prints
`{ ranked, topInquiry }` as JSON.

## Request example (`request.json`)

```json
{
  "trade": "waermepumpe",
  "postalCode": "10115",
  "building": { "type": "altbau", "heatedAreaM2": 140, "currentHeating": "gas" },
  "funding": { "wantsKfW": true },
  "notes": "Heizkörper sollen möglichst bleiben."
}
```

## Candidates example (`candidates.json`)

```json
[
  {
    "id": "places-1",
    "name": "Wärme & Technik Berlin GmbH",
    "location": { "lat": 52.53, "lng": 13.39 },
    "distanceKm": 4.2
  }
]
```

## Notes

- When `topInquiry` is `null`, no candidate was worth contacting (e.g. KfW
  wanted but none is funding-eligible) — surface the caveats from `ranked`.
- The Anfrage asks for an Angebot and, when funding is wanted, for confirmation
  the Betrieb can issue the Fachunternehmererklärung.
- All ranking, enrichment, and LLM logic lives in `@deutschland-os/shared`; this
  skill is a thin, portable wrapper.
