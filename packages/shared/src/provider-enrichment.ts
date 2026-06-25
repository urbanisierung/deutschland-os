import * as cheerio from "cheerio";
import { type ProviderCandidate, type ProviderMatch, ProviderMatchSchema } from "./service.js";

/**
 * Funding-eligibility enrichment against the Energieeffizienz-Experten-Liste
 * (energie-effizienz-experten.de / dena) — the official register that gates
 * KfW/BAFA (BEG) eligibility. This is the data Google Maps lacks and the core of
 * the service finder's added value: it turns a raw "exists here" candidate from
 * the Places API into a provider we know can keep a funding application valid.
 *
 * Endpoint and result markup verified against the live site (2026-06): the
 * residential ("Wohngebäude") search is a multipart POST to a TYPO3 results page,
 * filtered by company/surname + PLZ + radius. Each result is a `.expertendb_single`
 * block; the company sits in `.adresse strong`, the person in `.header-text`, and
 * the locality is the `PLZ Stadt` line of `.adresse`. Only the first results page
 * is parsed (15 entries); the `name` filter normally surfaces a match there.
 */

/** Live residential search results endpoint (multipart POST). */
export const ENERGIE_EFFIZIENZ_EXPERTEN_RESULTS =
  "https://www.energie-effizienz-experten.de/fuer-private-bauherren/finden-sie-experten-in-ihrer-naehe/suchergebnis";

/** TYPO3 form field for the company / surname filter. */
const FIELD_NAME = "tx_wwdenaexpertendb_qualification_suche[name]";
/** TYPO3 form field for the postal code the search centers on. */
const FIELD_PLZ = "tx_wwdenaexpertendb_qualification_suche[plz]";
/** TYPO3 form field for the search radius in km. */
const FIELD_UMKREIS = "tx_wwdenaexpertendb_qualification_suche[umkreis]";

/** One entry parsed from the Energieeffizienz-Experten-Liste search results. */
export type ExpertEntry = {
  /** Company name when present, otherwise the listed person's name. */
  name: string;
  /** City (PLZ stripped) when present, used to disambiguate same-named Betriebe. */
  locality: string | null;
};

const EXPERT_ENTRY_SELECTOR = ".expertendb_single";
const collapse = (text: string): string => text.replace(/\s+/g, " ").trim();

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

/** Extracts the city from an address line, dropping the leading PLZ ("10115 Berlin" → "Berlin"). */
function localityFromAddress(adresse: string): string | null {
  const match = collapse(adresse).match(/\d{5}\s+([A-Za-zÄÖÜäöüß.\-/ ]+)$/);
  return match?.[1] ? match[1].trim() : null;
}

/**
 * Parses Energieeffizienz-Experten-Liste search-results HTML into entries.
 * Pure; selectors verified against the live residential results page.
 */
export function parseExpertEntries(html: string): ExpertEntry[] {
  const $ = cheerio.load(html);
  const entries: ExpertEntry[] = [];

  $(EXPERT_ENTRY_SELECTOR).each((_, el) => {
    const node = $(el);
    const company = collapse(node.find(".adresse strong").first().text());
    const person = collapse(node.find(".header-text").first().text());
    const name = company || person;
    if (!name) return;
    entries.push({ name, locality: localityFromAddress(node.find(".adresse").first().text()) });
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

/** A search against the Energieeffizienz-Experten-Liste, filtered by name + location. */
export type ExpertQuery = { name: string; plz: string; umkreis?: number };
/** Runs a search and returns the raw results HTML. Injectable for tests. */
export type ExpertSearch = (query: ExpertQuery) => Promise<string>;

const SEARCH_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/**
 * Builds the default live search: a multipart POST to the residential results
 * page, filtered by company/surname, PLZ, and radius. Pass a custom `fetchImpl`
 * to route through a proxy; tests inject a fake {@link ExpertSearch} instead.
 */
export function createExpertSearch(fetchImpl: typeof fetch = fetch): ExpertSearch {
  return async ({ name, plz, umkreis = 10 }) => {
    const body = new FormData();
    body.set(FIELD_NAME, name);
    body.set(FIELD_PLZ, plz);
    body.set(FIELD_UMKREIS, String(umkreis));

    const response = await fetchImpl(ENERGIE_EFFIZIENZ_EXPERTEN_RESULTS, {
      method: "POST",
      body,
      redirect: "follow",
      headers: { "User-Agent": SEARCH_USER_AGENT, "Accept-Language": "de-DE,de;q=0.9" },
    });
    if (!response.ok) {
      throw new Error(`EE-Experten search failed (${response.status}).`);
    }
    return response.text();
  };
}

export type EnrichmentOptions = {
  /** Injected search; defaults to the live POST search. */
  search?: ExpertSearch;
  /** Search radius in km (default 10). */
  umkreis?: number;
  /** City to disambiguate same-named Betriebe. */
  locality?: string;
};

/** Lazily created so the default search is only constructed when first needed. */
let defaultSearch: ExpertSearch | undefined;

/**
 * Enriches a candidate with KfW/BAFA funding eligibility by checking the
 * Energieeffizienz-Experten-Liste around the given postal code. On a match, sets
 * `fundingEligible: true` and adds the `energieeffizienz-experte` certification. A
 * failed lookup (network/search error or no match) yields `fundingEligible: false`
 * — absence of evidence is treated as not-eligible, never as a thrown error, so
 * one bad lookup can't sink a whole batch. Validated as a {@link ProviderMatch}.
 */
export async function enrichProviderFundingEligibility(
  candidate: ProviderCandidate,
  plz: string,
  options: EnrichmentOptions = {},
): Promise<ProviderMatch> {
  if (!options.search && !defaultSearch) defaultSearch = createExpertSearch();
  const search = options.search ?? (defaultSearch as ExpertSearch);

  const existing = candidate.certifications ?? [];
  let fundingEligible = false;
  let certifications = existing;

  try {
    const html = await search({ name: candidate.name, plz, umkreis: options.umkreis });
    const entries = parseExpertEntries(html);
    const match = matchExpertEntry(candidate.name, entries, options.locality);
    if (match) {
      fundingEligible = true;
      certifications = existing.includes("energieeffizienz-experte")
        ? existing
        : [...existing, "energieeffizienz-experte"];
    }
  } catch {
    // Lookup failed; leave the candidate not-eligible rather than failing the batch.
  }

  return ProviderMatchSchema.parse({ ...candidate, certifications, fundingEligible });
}
