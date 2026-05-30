# Deutschland OS

A monorepo of practical tools for living in Germany. The first use case is a
**rental application generator**: given your profile and a property listing, it
produces a tailored, formal German application message (Anschreiben) and a
pre-filter verdict that flags problematic listings before you waste effort.

## What it does

From a **user profile** + a **listing** (scraped from a URL or entered manually)
it returns a structured result:

- `subjectLine` — professional German Betreff
- `coverLetter` — formal "Sie"-form cover letter, free of AI fluff
- `confidenceScore` — 0–100 match against the landlord's stated constraints
- `redFlagsDetected` — warnings (Tauschwohnung, Indexmiete, missing kitchen, …)
- `shouldApply` — `false` when a critical red flag applies

## Structure

```
deutschland-os/
├── apps/web/                 # Astro + Preact UI (form → result)
├── packages/
│   ├── shared/               # core: schemas, generator (LangChain/OpenAI), scraper
│   └── plugins/claude/       # Claude skill wrapping the shared core
```

The core logic lives in `@deutschland-os/shared` and is framework-agnostic; the
web app and the Claude skill are thin consumers.

See [`doc/scraping.md`](doc/scraping.md) for how listing scraping works and how
to deploy it.

## Prerequisites

- Node.js ≥ 22
- An OpenAI API key (`OPENAI_API_KEY`)

## Quickstart

```bash
npm install

# Run the checks
npm run lint
npm run typecheck
npm test
npm run build

# Run the web app (needs OPENAI_API_KEY in apps/web/.env)
cp apps/web/.env.example apps/web/.env   # then add your key
npm run dev
```

### Claude skill (CLI)

```bash
export OPENAI_API_KEY=sk-...
cd packages/plugins/claude
node --experimental-strip-types skills/real-estate-application/scripts/generate.ts \
  --profile ./profile.json \
  --url "https://www.immobilienscout24.de/expose/12345"
```

## Tech stack

TypeScript · Turborepo · Astro · Preact · Zustand · Vite · Biome · Vitest ·
LangChain + OpenAI · Zod · Cheerio
