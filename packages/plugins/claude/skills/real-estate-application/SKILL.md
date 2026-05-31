---
name: real-estate-application
description: >-
  Generate a tailored, formal German rental application message (Anschreiben)
  from a user profile and a property listing. Use when the user wants to apply
  for an apartment, write a Bewerbung/Anschreiben for a Wohnung, evaluate a
  listing for red flags (Tauschwohnung, Indexmiete, missing kitchen), or decide
  whether a listing is worth applying to.
---

# Real Estate Application Generator

Produces a structured application package for a German rental listing:

- `subjectLine` — professional German subject line (Betreff)
- `coverLetter` — formal "Sie"-form cover letter
- `confidenceScore` — 0–100 match against the landlord's stated constraints
- `redFlagsDetected` — warnings found in the listing
- `shouldApply` — pre-filter verdict (false on critical red flags / exclusions)

## When to use

Trigger when the user wants to apply to, or evaluate, a German rental listing —
whether they paste a listing URL, paste the listing text, or describe it.

## Inputs

1. **User profile** — a JSON file matching `UserProfileSchema` from
   `@deutschland-os/shared` (name, profession, employment status, household
   size, children, pets, net income, move-in date, notes).
2. **Listing** — either a listing **URL** (scraped automatically) or a
   pre-structured **listing JSON** matching `ListingSchema`.

## How to run

```bash
export OPENAI_API_KEY=sk-...
node --experimental-strip-types \
  skills/real-estate-application/scripts/generate.ts \
  --profile ./profile.json \
  --url "https://www.immobilienscout24.de/expose/12345"
```

Swap `--url` for `--listing ./listing.json` when you already have structured
listing data. The script prints `{ listing, result }` as JSON.

## Profile example (`profile.json`)

```json
{
  "fullName": "Adam",
  "profession": "Senior Cloud Platform & Software Developer",
  "employmentStatus": "Unbefristet",
  "householdSize": 3,
  "hasChildren": true,
  "hasPets": false,
  "monthlyNetIncome": 6500,
  "moveInDate": "Ab sofort / Flexibel",
  "additionalNotes": "Ruhiger Mieter, Nichtraucher."
}
```

## Notes

- The cover letter avoids AI marketing fluff and uses the formal "Sie" form.
- When `shouldApply` is `false`, surface the red flags to the user before they
  spend effort applying.
- All LLM and scraping logic lives in `@deutschland-os/shared`; this skill is a
  thin, portable wrapper.
