import { describe, expect, it, vi } from "vitest";
import {
  type ExpertSearch,
  enrichProviderFundingEligibility,
  matchExpertEntry,
  normalizeCompanyName,
  parseExpertEntries,
} from "./provider-enrichment.js";
import type { ProviderCandidate } from "./service.js";

const candidate: ProviderCandidate = {
  id: "places-abc123",
  name: "RWP Beratende Ingenieure f Bauphysik GmbH & Co. KG",
  location: { lat: 52.53, lng: 13.39 },
  distanceKm: 4.2,
  url: null,
};

// Structure mirrors the live residential results page (.expertendb_single blocks).
const resultsHtml = `
<div class="expert-search-result">
  <div class="expertendb_single">
    <div class="header"><div class="header-text">Dipl.-Ing. (FH)\n Jens Wesner</div></div>
    <div class="c-container"><div class="c-column">
      <div class="adresse"><strong>RWP Beratende Ingenieure f Bauphysik GmbH &amp; Co. KG</strong><br/> Musterstr. 1,<br/> 10115 Berlin </div>
    </div></div>
  </div>
  <div class="expertendb_single">
    <div class="header"><div class="header-text">Julia Wadehn</div></div>
    <div class="c-container"><div class="c-column">
      <div class="adresse"><strong>NOVO Building GmbH</strong><br/> Beispielweg 2,<br/> 14467 Potsdam </div>
    </div></div>
  </div>
</div>`;

const search = (html: string): ExpertSearch => vi.fn().mockResolvedValue(html);

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
  it("extracts company name and city (PLZ stripped) per result", () => {
    const entries = parseExpertEntries(resultsHtml);
    expect(entries).toEqual([
      { name: "RWP Beratende Ingenieure f Bauphysik GmbH & Co. KG", locality: "Berlin" },
      { name: "NOVO Building GmbH", locality: "Potsdam" },
    ]);
  });

  it("falls back to the person name when no company is listed", () => {
    const html = `<div class="expertendb_single">
      <div class="header"><div class="header-text">Hanna Full</div></div>
      <div class="adresse"> Straße 3,<br/> 10115 Berlin </div>
    </div>`;
    expect(parseExpertEntries(html)).toEqual([{ name: "Hanna Full", locality: "Berlin" }]);
  });

  it("returns an empty array when there are no results", () => {
    expect(parseExpertEntries("<div>Keine Treffer</div>")).toEqual([]);
  });
});

describe("matchExpertEntry", () => {
  const entries = parseExpertEntries(resultsHtml);

  it("matches across legal-form differences (suffix dropped) and city", () => {
    const match = matchExpertEntry("NOVO Building", entries, "Potsdam");
    expect(match?.name).toBe("NOVO Building GmbH");
  });

  it("returns null when the company is not listed", () => {
    expect(matchExpertEntry("Kälteprofi Hamburg GmbH", entries)).toBeNull();
  });

  it("rejects a name match in a different city", () => {
    expect(matchExpertEntry("NOVO Building GmbH", entries, "München")).toBeNull();
  });
});

describe("enrichProviderFundingEligibility", () => {
  it("sets fundingEligible and adds the certification on a match", async () => {
    const result = await enrichProviderFundingEligibility(candidate, "10115", {
      search: search(resultsHtml),
      locality: "Berlin",
    });
    expect(result.fundingEligible).toBe(true);
    expect(result.certifications).toContain("energieeffizienz-experte");
  });

  it("passes the candidate name and PLZ to the search", async () => {
    const spy = search(resultsHtml);
    await enrichProviderFundingEligibility(candidate, "10115", { search: spy, umkreis: 20 });
    expect(spy).toHaveBeenCalledWith({ name: candidate.name, plz: "10115", umkreis: 20 });
  });

  it("leaves the candidate not-eligible when unlisted", async () => {
    const result = await enrichProviderFundingEligibility(candidate, "10115", {
      search: search("<div>Keine Treffer</div>"),
    });
    expect(result.fundingEligible).toBe(false);
    expect(result.certifications).toEqual([]);
  });

  it("treats a failed search as not-eligible instead of throwing", async () => {
    const failing: ExpertSearch = vi.fn().mockRejectedValue(new Error("network down"));
    const result = await enrichProviderFundingEligibility(candidate, "10115", { search: failing });
    expect(result.fundingEligible).toBe(false);
  });

  it("does not duplicate an already-present certification", async () => {
    const seeded: ProviderCandidate = {
      ...candidate,
      certifications: ["energieeffizienz-experte", "meisterbetrieb"],
    };
    const result = await enrichProviderFundingEligibility(seeded, "10115", {
      search: search(resultsHtml),
      locality: "Berlin",
    });
    expect(result.certifications).toEqual(["energieeffizienz-experte", "meisterbetrieb"]);
  });
});
