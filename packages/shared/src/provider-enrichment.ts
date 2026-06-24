import * as cheerio from "cheerio";
import { createFetcherFromEnv, type FetchLike } from "./fetcher.js";
import { type ProviderMatch, ProviderMatchSchema } from "./service.js";

/**
 * Funding-eligibility enrichment against the Energieeffizienz-Experten-Liste
 * (energie-effizienz-experten.de / dena) — the official register that gates
 * KfW/BAFA (BEG) eligibility. This is the data Google Maps lacks and the core of
 * the service finder's added value: it turns a raw "exists here" candidate from
 * the Places API into a provider we know can keep a funding application valid.
 *
 * The HTML parsing and matching are pure and fixture-tested. The live DOM and
 * search endpoint cannot be verified from here, so the selectors and search URL
 * below are PROVISIONAL — validate and adjust them against the live site before
 * relying on this in production (mirrors the per-portal selector work tracked for
 * the listing scraper).
 */

/** A factual candidate from the data layer (Places API) before funding enrichment. */
export type ProviderCandidate = Omit<ProviderMatch, "certifications" | "fundingEligible"> & {
  certifications?: ProviderMatch["certifications"];
};

/** One entry parsed from the Energieeffizienz-Experten-Liste search results. */
export type ExpertEntry = {
  name: string;
  /** City / locality when present, used to disambiguate same-named Betriebe. */
  locality: string | null;
};

/** PROVISIONAL search endpoint — confirm the real query parameter against the live site. */
export const ENERGIE_EFFIZIENZ_EXPERTEN_SEARCH =
  "https://www.energie-effizienz-experten.de/expertensuche/?q={query}";

/** PROVISIONAL result selectors — confirm against the live site's markup. */
const EXPERT_ENTRY_SELECTOR = ".search-result, .expert-entry, li.result";
const EXPERT_NAME_SELECTOR = ".name, .company, h3, h2";
const EXPERT_LOCALITY_SELECTOR = ".locality, .city, .ort";

/** German legal-form tokens stripped before comparing company names. */
const LEGAL_FORM_TOKENS = [
  "gmbh & co. kg",
  "gmbh & co kg",
  "gmbh",
  "mbh",
  "ug (haftungsbeschränkt)",
  "ug",
  "e.k.",
  "e. k.",
  "ohg",
  "gbr",
  "kg",
  "ag",
];

/**
 * Normalizes a company name for robust comparison: folds German umlauts/ß,
 * lowercases, strips legal forms (GmbH, UG, …) and all non-alphanumerics. So
 * "Wärme & Technik Berlin GmbH" and "Waerme und Technik Berlin" both reduce to
 * "waermeundtechnikberlin"-ish keys that compare equal where it matters.
 */
export function normalizeCompanyName(name: string): string {
  let s = name.toLowerCase();
  s = s.replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");
  s = s.replace(/&/g, " und ");
  for (const token of LEGAL_FORM_TOKENS) {
    const folded = token.replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue");
    s = s.replaceAll(folded, " ");
  }
  return s.replace(/[^a-z0-9]/g, "");
}

/**
 * Parses Energieeffizienz-Experten-Liste search-results HTML into entries.
 * Pure; selectors are provisional (see module note).
 */
export function parseExpertEntries(html: string): ExpertEntry[] {
  const $ = cheerio.load(html);
  const entries: ExpertEntry[] = [];

  $(EXPERT_ENTRY_SELECTOR).each((_, el) => {
    const node = $(el);
    const name = node.find(EXPERT_NAME_SELECTOR).first().text().trim();
    if (!name) return;
    const locality = node.find(EXPERT_LOCALITY_SELECTOR).first().text().trim();
    entries.push({ name, locality: locality || null });
  });

  return entries;
}

/**
 * Returns the matching expert entry for a candidate name, or null. Matches on
 * normalized names with either-direction containment (so "… Berlin GmbH" matches
 * a list entry "… Berlin"), guarded by a minimum key length to avoid trivial
 * substring hits. When `locality` is given, an entry whose locality is known and
 * differs is rejected.
 */
export function matchExpertEntry(
  candidateName: string,
  entries: ExpertEntry[],
  locality?: string,
): ExpertEntry | null {
  const target = normalizeCompanyName(candidateName);
  if (target.length < 4) return null;
  const wantedLocality = locality ? normalizeCompanyName(locality) : null;

  for (const entry of entries) {
    const candidate = normalizeCompanyName(entry.name);
    if (candidate.length < 4) continue;
    const namesMatch =
      candidate === target || candidate.includes(target) || target.includes(candidate);
    if (!namesMatch) continue;

    if (wantedLocality && entry.locality) {
      const entryLocality = normalizeCompanyName(entry.locality);
      if (entryLocality && entryLocality !== wantedLocality) continue;
    }
    return entry;
  }
  return null;
}

/** Builds the Energieeffizienz-Experten search URL for a query. */
export function buildExpertSearchUrl(
  query: string,
  base: string = ENERGIE_EFFIZIENZ_EXPERTEN_SEARCH,
): string {
  return base.replaceAll("{query}", encodeURIComponent(query));
}

export type EnrichmentOptions = {
  /** Injected fetcher; defaults to the env-configured resilient fetcher. */
  fetchImpl?: FetchLike;
  /** Override the search URL builder (e.g. to point at a confirmed endpoint). */
  searchUrl?: (query: string) => string;
  /** Locality (city) to disambiguate same-named Betriebe. */
  locality?: string;
};

/** Lazily created so environment configuration is read at call time, not import time. */
let defaultFetcher: FetchLike | undefined;

/**
 * Enriches a candidate with KfW/BAFA funding eligibility by checking the
 * Energieeffizienz-Experten-Liste. On a match, sets `fundingEligible: true` and
 * adds the `energieeffizienz-experte` certification. A failed lookup (network
 * error, non-OK response, or no match) yields `fundingEligible: false` — absence
 * of evidence is treated as not-eligible, never as a thrown error, so one bad
 * lookup can't sink a whole batch. The result is validated as a {@link ProviderMatch}.
 */
export async function enrichProviderFundingEligibility(
  candidate: ProviderCandidate,
  options: EnrichmentOptions = {},
): Promise<ProviderMatch> {
  const buildUrl = options.searchUrl ?? ((q: string) => buildExpertSearchUrl(q));
  if (!options.fetchImpl && !defaultFetcher) defaultFetcher = createFetcherFromEnv();
  const doFetch = options.fetchImpl ?? (defaultFetcher as FetchLike);

  const existing = candidate.certifications ?? [];
  let fundingEligible = false;
  let certifications = existing;

  try {
    const response = await doFetch(buildUrl(candidate.name));
    if (response.ok) {
      const entries = parseExpertEntries(await response.text());
      const match = matchExpertEntry(candidate.name, entries, options.locality);
      if (match) {
        fundingEligible = true;
        certifications = existing.includes("energieeffizienz-experte")
          ? existing
          : [...existing, "energieeffizienz-experte"];
      }
    }
  } catch {
    // Lookup failed; leave the candidate not-eligible rather than failing the batch.
  }

  return ProviderMatchSchema.parse({ ...candidate, certifications, fundingEligible });
}
