import { describe, expect, it } from "vitest";
import { parseProviderLines } from "./serviceStore.js";

describe("parseProviderLines", () => {
  it("parses name, distance, eligibility, and valid certifications", () => {
    const providers = parseProviderLines(
      "Wärme & Technik Berlin GmbH; 4.2; ja; meisterbetrieb, innung-shk",
    );
    expect(providers).toHaveLength(1);
    expect(providers[0]).toMatchObject({
      name: "Wärme & Technik Berlin GmbH",
      distanceKm: 4.2,
      fundingEligible: true,
      certifications: ["meisterbetrieb", "innung-shk"],
    });
  });

  it("treats anything but ja/j/true/yes as not funding-eligible", () => {
    const [a] = parseProviderLines("A; 5; nein");
    const [b] = parseProviderLines("B; 5; ja");
    expect(a?.fundingEligible).toBe(false);
    expect(b?.fundingEligible).toBe(true);
  });

  it("drops unknown certification tokens", () => {
    const [p] = parseProviderLines("A; 5; ja; meisterbetrieb, bogus-cert");
    expect(p?.certifications).toEqual(["meisterbetrieb"]);
  });

  it("skips blank lines and malformed rows", () => {
    const providers = parseProviderLines("\nNoDistance\n; 5; ja\nGut GmbH; 3; ja\n");
    expect(providers.map((p) => p.name)).toEqual(["Gut GmbH"]);
  });

  it("parses German decimal commas in distance", () => {
    const [p] = parseProviderLines("A; 4,7; nein");
    expect(p?.distanceKm).toBe(4.7);
  });
});
