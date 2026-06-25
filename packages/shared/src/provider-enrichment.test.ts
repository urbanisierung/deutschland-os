import { describe, expect, it, vi } from "vitest";
import type { FetchLike, HttpResponse } from "./fetcher.js";
import {
  buildExpertSearchUrl,
  enrichProviderFundingEligibility,
  matchExpertEntry,
  normalizeCompanyName,
  parseExpertEntries,
} from "./provider-enrichment.js";
import type { ProviderCandidate } from "./service.js";

const candidate: ProviderCandidate = {
  id: "places-abc123",
  name: "Wärme & Technik Berlin GmbH",
  location: { lat: 52.53, lng: 13.39 },
  distanceKm: 4.2,
  url: null,
};

const resultsHtml = `<ul>
  <li class="result"><h3 class="name">Wärme &amp; Technik Berlin</h3><span class="city">Berlin</span></li>
  <li class="result"><h3 class="name">Sonnen Heizbau GmbH</h3><span class="city">Potsdam</span></li>
</ul>`;

const ok = (body: string): HttpResponse => ({
  ok: true,
  status: 200,
  text: async () => body,
});

describe("normalizeCompanyName", () => {
  it("folds umlauts and strips legal forms + punctuation", () => {
    expect(normalizeCompanyName("Wärme & Technik Berlin GmbH")).toBe("waermeundtechnikberlin");
  });

  it("reduces equivalent spellings to the same key", () => {
    expect(normalizeCompanyName("Müller Heizung UG (haftungsbeschränkt)")).toBe(
      normalizeCompanyName("Mueller Heizung"),
    );
  });
});

describe("parseExpertEntries", () => {
  it("extracts name and locality per result", () => {
    const entries = parseExpertEntries(resultsHtml);
    expect(entries).toEqual([
      { name: "Wärme & Technik Berlin", locality: "Berlin" },
      { name: "Sonnen Heizbau GmbH", locality: "Potsdam" },
    ]);
  });

  it("returns an empty array when there are no results", () => {
    expect(parseExpertEntries("<div>Keine Treffer</div>")).toEqual([]);
  });
});

describe("matchExpertEntry", () => {
  const entries = parseExpertEntries(resultsHtml);

  it("matches across legal-form and locality differences", () => {
    const match = matchExpertEntry("Wärme & Technik Berlin GmbH", entries, "Berlin");
    expect(match?.name).toBe("Wärme & Technik Berlin");
  });

  it("returns null when the company is not listed", () => {
    expect(matchExpertEntry("Kälteprofi Hamburg GmbH", entries)).toBeNull();
  });

  it("rejects a name match in a different locality", () => {
    expect(matchExpertEntry("Sonnen Heizbau GmbH", entries, "München")).toBeNull();
  });
});

describe("buildExpertSearchUrl", () => {
  it("url-encodes the query into the template", () => {
    const url = buildExpertSearchUrl("Wärme & Technik", "https://example.test/?q={query}");
    expect(url).toBe("https://example.test/?q=W%C3%A4rme%20%26%20Technik");
  });
});

describe("enrichProviderFundingEligibility", () => {
  it("sets fundingEligible and adds the certification on a match", async () => {
    const fetchImpl: FetchLike = vi.fn().mockResolvedValue(ok(resultsHtml));
    const result = await enrichProviderFundingEligibility(candidate, {
      fetchImpl,
      locality: "Berlin",
    });
    expect(result.fundingEligible).toBe(true);
    expect(result.certifications).toContain("energieeffizienz-experte");
  });

  it("leaves the candidate not-eligible when unlisted", async () => {
    const fetchImpl: FetchLike = vi.fn().mockResolvedValue(ok("<div>Keine Treffer</div>"));
    const result = await enrichProviderFundingEligibility(candidate, { fetchImpl });
    expect(result.fundingEligible).toBe(false);
    expect(result.certifications).toEqual([]);
  });

  it("treats a failed lookup as not-eligible instead of throwing", async () => {
    const fetchImpl: FetchLike = vi.fn().mockRejectedValue(new Error("network down"));
    const result = await enrichProviderFundingEligibility(candidate, { fetchImpl });
    expect(result.fundingEligible).toBe(false);
  });

  it("does not duplicate an already-present certification", async () => {
    const fetchImpl: FetchLike = vi.fn().mockResolvedValue(ok(resultsHtml));
    const seeded: ProviderCandidate = {
      ...candidate,
      certifications: ["energieeffizienz-experte", "meisterbetrieb"],
    };
    const result = await enrichProviderFundingEligibility(seeded, {
      fetchImpl,
      locality: "Berlin",
    });
    expect(result.certifications).toEqual(["energieeffizienz-experte", "meisterbetrieb"]);
  });
});
