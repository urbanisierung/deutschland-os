# Instructions

<!-- Part 1 & 2: Portable across repos. Do NOT add repo-specific rules here. -->
<!-- Repo-specific instructions go in .github/instructions/repo.instructions.md -->

## Part 1 — Behavioral Guidelines

### Think Before Coding

Don't assume. Don't hide confusion. Surface tradeoffs.

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### Simplicity First

Minimum code that solves the problem. Nothing speculative.

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### Surgical Changes

Touch only what you must. Clean up only your own mess.

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

### Goal-Driven Execution

Define success criteria. Loop until verified.

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

## Part 2 — General Coding Quality

### Code Correctness

- Zero compiler/type errors. Always.
- Zero linting warnings. Always.
- All existing tests must pass after your changes.
- If you change behavior, update or add tests to cover it.

### Formatting & Linting

- Run the project's formatter and linter before considering any task complete.
- Never submit code that fails formatting or linting checks.
- Match the project's existing formatting configuration — do not override it.

### Testing

- Write tests for new functionality.
- Bug fixes must include a regression test.
- Don't delete or skip existing tests unless explicitly asked.
- Tests must be deterministic — no flaky assertions, no timing dependencies.

### Error Handling

- Handle errors at the appropriate level — don't swallow them silently.
- Provide actionable error messages that help debugging.
- Fail fast on invalid input — don't let bad data propagate.

### Security

- Never commit secrets, tokens, or credentials.
- Validate and sanitize all external input.
- Use parameterized queries for database access.
- Prefer established security libraries over hand-rolled solutions.

### Performance

- Consider performance implications of your changes.
- Avoid unnecessary allocations, copies, or iterations.
- Don't optimize prematurely — but don't write obviously slow code either.

### Documentation

- Update documentation when your changes affect public APIs or user-facing behavior.
- Code comments explain *why*, not *what*. The code itself should explain *what*.
- Don't add comments that merely restate the code.

### Pre-Completion Checklist

Before finishing any task, verify:
1. The project builds with zero warnings and zero errors.
2. Formatting and linting pass.
3. Type checking passes with zero errors.
4. All tests pass.

<!-- Part 3: Everything below is specific to THIS repository. -->

## Repository Overview

Greenfield monorepo. Two primary concerns:

1. **Web apps** — user-facing Astro/Preact applications
2. **AI plugin/skill packages** — Claude plugins today, designed to support other AI platforms (Gemini, Copilot, etc.) without rearchitecting

## Tech Stack

- **Language:** TypeScript (latest stable)
- **Monorepo:** Turborepo
- **Runtime:** Node.js (latest LTS)
- **Web framework:** Astro (latest)
- **UI:** Preact (latest)
- **State:** Zustand (latest)
- **Bundler:** Vite (latest)
- **Linter/Formatter:** Biome (latest) — replaces ESLint + Prettier
- **Testing:** Vitest (latest)
- **CI:** GitHub Actions

Always use the most recent stable versions. No legacy compat shims.

## Project Structure

```
deutschland-os/
├── package.json            # workspace root
├── turbo.json              # pipeline config
├── biome.json              # shared lint/format config
├── packages/
│   ├── plugins/            # AI plugin/skill packages
│   │   ├── claude/         # Claude Code skills
│   │   └── <platform>/     # future: Gemini, Copilot, etc.
│   └── shared/             # shared types, utilities
└── apps/
    └── <app-name>/         # Astro web apps
```

## Build & Check Commands

- Install deps: `npm install` (or `pnpm install` if pnpm is configured)
- Build all: `turbo build`
- Dev: `turbo dev`
- Test: `turbo test` (runs Vitest across packages)
- Lint: `biome check .`
- Format: `biome format --write .`
- Type check: `tsc --noEmit` (per package)

## TypeScript Practices

- Strict mode always (`"strict": true`)
- No `any` — use `unknown` and narrow
- Prefer `type` over `interface` for object shapes; `interface` for extension points
- No barrel re-exports that mask tree-shaking
- Explicit return types on public functions

## Biome

Single `biome.json` at root. All packages inherit it. Do not add per-package ESLint or Prettier configs — Biome is the sole formatter and linter.

## Testing

- Vitest for all unit and integration tests
- Tests colocated with source: `foo.ts` → `foo.test.ts`
- No snapshot tests unless explicitly requested
- Tests must be deterministic — no `Date.now()`, no `Math.random()` without seeding

## Plugin/Skill Packages

- Each platform gets its own sub-package under `packages/plugins/`
- Shared skill logic lives in `packages/shared/` — platform packages adapt it
- Skills/plugins must be self-contained: no runtime deps on web app packages
- Design for portability: avoid Claude-specific APIs in shared logic

## Documentation Requirements

| File              | Purpose                                            | Update Frequency           |
| ----------------- | -------------------------------------------------- | -------------------------- |
| `README.md`       | Brief intro, motivation, prerequisites, quickstart | On significant changes     |
| `doc/progress.md` | Historical changelog                               | **Every change**           |
| `doc/features.md` | High-level feature list with timestamps            | When features are added    |
| `doc/roadmap.md`  | Implementation roadmap with action items           | Check items when completed |

### Roadmap Tracking

When completing action items from `doc/roadmap.md`:

- Mark completed items with `[x]` instead of `[ ]`
- Keep the roadmap up-to-date as features are implemented