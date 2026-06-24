# EU Compliance Radar

A scan of the 2025–2030 wave of EU regulatory-digitalization mandates, and the
decision about which (if any) belong in Deutschland OS.

## The thesis

Regulators are forcing companies off human-readable PDFs/portals onto
**structured, machine-readable data exchange + APIs + identity + audit trails**.
E-invoicing is the visible edge of a much broader shift. That structured-data
gap is adjacent to what Deutschland OS already does (normalize messy real-world
inputs into validated, structured output).

> **Caveat:** a "Digital Omnibus" simplification wave (2025–26) is trimming and
> delaying several of these. Treat the dates below as directionally firm, not
> fixed.

## The mandates

| Mandate | Key date(s) | What it requires | Format / standard |
| --- | --- | --- | --- |
| **E-invoicing / VAT** | DE receive **2025**, send **2027** (>€800k) / **2028** (all); EU ViDA **Jul 2030** | Structured e-invoices, B2B exchange | EN 16931, XRechnung, ZUGFeRD, Peppol |
| **NIS2** (cybersecurity) | Transposed | Risk controls + 24h/72h incident reporting | — |
| **DORA** (finance) | In force **2025** | ICT risk, resilience testing, vendor registers | — |
| **AI Act** | GPAI live **2025**; high-risk (Annex III) deferred to **Dec 2027** | Risk classification, documentation, transparency | — |
| **CSRD / ESRS** | >1000 employees & >€450M turnover | Sustainability reporting, digital tagging | XBRL |
| **CBAM** | Definitive regime **Jan 2026** | Embedded-emissions data + certificate mgmt | — |
| **EUDR** | Large/medium **Dec 2026** | Geolocation + due-diligence statements | TRACES |
| **Digital Product Passport** (ESPR) | Battery passport **Feb 2027** | Product registry + identifiers | GS1 IDs |
| **EU Data Act** | Connected products from **Sep 2026** | Access-by-design, data APIs | — |
| **eIDAS 2 / EUDI Wallet** | Member-state wallets **2026**, mandatory acceptance **2027** | Digital identity, attestations | — |
| **European Accessibility Act** | Enforced since **Jun 2025** | Accessible web/mobile | WCAG |

## Decision: build e-invoicing, document the rest

Deutschland OS is a **consumer-facing** project ("practical tools for living in
Germany") built and maintained **solo**. Most of the table is the opposite of
that: B2B compliance platforms requiring enterprise integration, certified
formats, legal liability, and continuous regulatory tracking. None of those are
solo-buildable, and building them would pull the project off-mission.

**E-invoicing is the exception**, and it's the one we build:

- **Fits the existing architecture exactly** — same shape as the rental
  generator: a Zod schema + logic in `packages/shared`, a web view, a Claude
  skill.
- **The core is deterministic, not LLM** — generating valid XRechnung/ZUGFeRD
  XML is schema-driven serialization + validation. More reliable and more
  testable than an LLM flow; the official EN 16931 example files become Vitest
  fixtures.
- **Real individual / freelancer / SMB angle** — from Jan 2025 every German
  business must be able to *receive* e-invoices (sending phases in 2027/2028).
  Freelancers and Kleinunternehmer are badly served by existing tooling. That is
  squarely "tools for living/working in Germany."
- **Mature libraries exist** — wrap, don't reinvent (KoSIT validator as the
  conformance source of truth, Mustangproject as reference, pdf-lib for the
  PDF/A-3 step).

### Scope boundaries (what keeps it solo-sized)

- **Build the documents, not the network.** Generate, validate, and parse
  XRechnung/ZUGFeRD. Do **not** build a Peppol Access Point — that needs a
  certified provider and would be integrated later, not run in-house.
- **Lean on the official KoSIT validator for conformance.** Run it in CI against
  generated output rather than hand-rolling conformance claims.
- **ZUGFeRD PDF/A-3 embedding is the one fiddly part** — ship pure-XML
  XRechnung first; add the hybrid PDF once a JS embedding path is verified.

## If a second mandate ever earns a slot

Re-evaluate from this doc; don't build speculatively. The next-most-bounded
candidates are **CBAM** and the **Digital Product Passport** (both structured-
data + registry problems). CSRD, DORA, and NIS2 are enterprise/platform plays to
stay away from as a solo project.
