import { describe, expect, it, vi } from "vitest";
import type { ProviderInquiry, ProviderMatch, ServiceRequest } from "./service.js";
import { findAndDraft } from "./service-finder.js";
import type { ServiceModel } from "./service-generator.js";

const request: ServiceRequest = {
  trade: "waermepumpe",
  postalCode: "10115",
  building: { type: "altbau", heatedAreaM2: 140, currentHeating: "gas" },
  funding: { wantsKfW: true },
  notes: "",
};

const provider = (overrides: Partial<ProviderMatch>): ProviderMatch => ({
  id: "p",
  name: "Betrieb",
  location: { lat: 52.5, lng: 13.4 },
  distanceKm: 5,
  certifications: [],
  fundingEligible: false,
  url: null,
  ...overrides,
});

const inquiry: ProviderInquiry = {
  subjectLine: "Anfrage",
  inquiryMessage: "Sehr geehrte Damen und Herren, …",
  matchScore: 90,
  caveats: [],
  shouldContact: true,
};

describe("findAndDraft", () => {
  it("ranks, then drafts an inquiry for the top contactable provider", async () => {
    const model: ServiceModel = { invoke: vi.fn().mockResolvedValue(inquiry) };
    const eligible = provider({ id: "good", name: "Gut GmbH", fundingEligible: true });
    const ineligible = provider({ id: "bad", name: "Schlecht GmbH", fundingEligible: false });

    const result = await findAndDraft(request, [ineligible, eligible], model);

    expect(result.ranked.map((r) => r.provider.id)).toEqual(["good", "bad"]);
    expect(result.topInquiry?.providerId).toBe("good");
    expect(result.topInquiry?.inquiry).toEqual(inquiry);
    expect(model.invoke).toHaveBeenCalledOnce();
  });

  it("returns no inquiry and skips the model when nobody is worth contacting", async () => {
    const model: ServiceModel = { invoke: vi.fn() };
    // KfW wanted but no candidate is funding-eligible → all shouldContact false.
    const result = await findAndDraft(request, [provider({ fundingEligible: false })], model);

    expect(result.topInquiry).toBeNull();
    expect(result.ranked).toHaveLength(1);
    expect(model.invoke).not.toHaveBeenCalled();
  });
});
