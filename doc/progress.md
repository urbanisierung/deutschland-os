# Progress

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
