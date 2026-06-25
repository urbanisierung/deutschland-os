import { describe, expect, it } from "vitest";
import { rankProviders, scoreProvider } from "./provider-scoring.js";
import type { ProviderMatch, ServiceRequest } from "./service.js";

const request: ServiceRequest = {
  trade: "waermepumpe",
  postalCode: "10115",
  building: { type: "altbau", heatedAreaM2: 140, currentHeating: "gas" },
  funding: { wantsKfW: true },
  notes: "",
};

const baseProvider: ProviderMatch = {
  id: "p",
  name: "Betrieb",
  location: { lat: 52.5, lng: 13.4 },
  distanceKm: 5,
  certifications: [],
  fundingEligible: false,
  url: null,
};

const provider = (overrides: Partial<ProviderMatch>): ProviderMatch => ({
  ...baseProvider,
  ...overrides,
});

describe("scoreProvider", () => {
  it("scores a close, funding-eligible, well-certified Betrieb near the top", () => {
    const result = scoreProvider(
      request,
      provider({
        distanceKm: 2,
        fundingEligible: true,
        certifications: ["energieeffizienz-experte", "meisterbetrieb", "innung-shk"],
      }),
    );
    expect(result.score).toBeGreaterThanOrEqual(90);
    expect(result.shouldContact).toBe(true);
    expect(result.caveats).toEqual([]);
  });

  it("flags KfW wanted but not funding-eligible as a critical caveat", () => {
    const result = scoreProvider(request, provider({ fundingEligible: false }));
    expect(result.shouldContact).toBe(false);
    expect(result.factors.funding).toBe(0);
    expect(result.caveats[0]).toContain("Energieeffizienz-Experten-Liste");
  });

  it("does not penalize funding when the user does not want KfW", () => {
    const noFunding: ServiceRequest = { ...request, funding: { wantsKfW: false } };
    const result = scoreProvider(noFunding, provider({ fundingEligible: false }));
    expect(result.factors.funding).toBe(1);
    expect(result.shouldContact).toBe(true);
    expect(result.caveats).not.toContain(
      "Nicht auf der Energieeffizienz-Experten-Liste — KfW/BAFA-Förderung gefährdet.",
    );
  });

  it("decays the distance factor to 0 beyond the max distance", () => {
    const near = scoreProvider(request, provider({ distanceKm: 0, fundingEligible: true }));
    const far = scoreProvider(request, provider({ distanceKm: 60, fundingEligible: true }));
    expect(near.factors.distance).toBe(1);
    expect(far.factors.distance).toBe(0);
    expect(near.score).toBeGreaterThan(far.score);
  });

  it("adds an out-of-area caveat past the far-distance threshold", () => {
    const result = scoreProvider(request, provider({ distanceKm: 42, fundingEligible: true }));
    expect(result.caveats.some((c) => c.includes("42 km"))).toBe(true);
  });

  it("saturates the certification factor and ignores the funding cert there", () => {
    const result = scoreProvider(
      request,
      provider({
        fundingEligible: true,
        certifications: [
          "energieeffizienz-experte",
          "meisterbetrieb",
          "innung-shk",
          "viessmann-fachpartner",
          "vaillant-fachpartner",
        ],
      }),
    );
    // 4 trust certs (excluding the funding one) saturate at 1.
    expect(result.factors.certifications).toBe(1);
  });
});

describe("rankProviders", () => {
  it("orders best-first and breaks ties by distance then name", () => {
    const eligibleFar = provider({
      id: "a",
      name: "Alpha",
      distanceKm: 20,
      fundingEligible: true,
      certifications: ["meisterbetrieb"],
    });
    const eligibleNearB = provider({
      id: "b",
      name: "Bravo",
      distanceKm: 3,
      fundingEligible: true,
      certifications: ["meisterbetrieb"],
    });
    const ineligible = provider({ id: "c", name: "Charlie", fundingEligible: false });

    const ranked = rankProviders(request, [eligibleFar, ineligible, eligibleNearB]);
    expect(ranked.map((r) => r.provider.id)).toEqual(["b", "a", "c"]);
    const scores = ranked.map((r) => r.score.score);
    expect(scores).toEqual([...scores].sort((x, y) => y - x));
    expect(ranked.map((r) => r.score.shouldContact)).toEqual([true, true, false]);
  });

  it("is a pure ranking — identical input yields identical order", () => {
    const providers = [
      provider({ id: "x", name: "X", distanceKm: 10, fundingEligible: true }),
      provider({ id: "y", name: "Y", distanceKm: 10, fundingEligible: true }),
    ];
    const first = rankProviders(request, providers).map((r) => r.provider.id);
    const second = rankProviders(request, providers).map((r) => r.provider.id);
    expect(first).toEqual(second);
    expect(first).toEqual(["x", "y"]);
  });
});
