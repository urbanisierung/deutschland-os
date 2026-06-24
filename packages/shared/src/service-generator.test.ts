import { describe, expect, it, vi } from "vitest";
import type { ProviderInquiry, ProviderMatch, ServiceRequest } from "./service.js";
import {
  buildServiceHumanPrompt,
  generateServiceRequest,
  type ServiceModel,
} from "./service-generator.js";

const request: ServiceRequest = {
  trade: "waermepumpe",
  postalCode: "10115",
  building: { type: "altbau", heatedAreaM2: 140, currentHeating: "gas" },
  funding: { wantsKfW: true },
  notes: "Heizkörper sollen möglichst bleiben.",
};

const provider: ProviderMatch = {
  id: "places-abc123",
  name: "Wärme & Technik Berlin GmbH",
  location: { lat: 52.53, lng: 13.39 },
  distanceKm: 4.2,
  certifications: ["energieeffizienz-experte", "meisterbetrieb"],
  fundingEligible: true,
  url: null,
};

const validInquiry: ProviderInquiry = {
  subjectLine: "Anfrage Wärmepumpen-Installation in 10115 Berlin",
  inquiryMessage: "Sehr geehrte Damen und Herren,\n\n...\n\nMit freundlichen Grüßen\nAdam",
  matchScore: 91,
  caveats: [],
  shouldContact: true,
};

describe("buildServiceHumanPrompt", () => {
  it("includes request and provider facts", () => {
    const prompt = buildServiceHumanPrompt({ request, provider });
    expect(prompt).toContain("Gewerk: waermepumpe");
    expect(prompt).toContain("140 m²");
    expect(prompt).toContain("KfW/BAFA-Förderung gewünscht: ja");
    expect(prompt).toContain("Wärme & Technik Berlin GmbH");
    expect(prompt).toContain("4.2 km");
    expect(prompt).toContain("energieeffizienz-experte, meisterbetrieb");
    expect(prompt).toContain("Förderfähig (KfW/BAFA): ja");
  });

  it("renders an empty certification list as 'keine bekannt'", () => {
    const sparse: ProviderMatch = { ...provider, certifications: [] };
    const prompt = buildServiceHumanPrompt({ request, provider: sparse });
    expect(prompt).toContain("Zertifizierungen: keine bekannt");
  });

  it("renders missing notes as an em dash", () => {
    const prompt = buildServiceHumanPrompt({
      request: { ...request, notes: "" },
      provider,
    });
    expect(prompt).toContain("Hinweise: —");
  });
});

describe("generateServiceRequest", () => {
  it("validates input, calls the model, and validates output", async () => {
    const model: ServiceModel = { invoke: vi.fn().mockResolvedValue(validInquiry) };
    const result = await generateServiceRequest({ request, provider }, model);
    expect(result).toEqual(validInquiry);
    expect(model.invoke).toHaveBeenCalledOnce();
  });

  it("rejects an invalid postal code before calling the model", async () => {
    const model: ServiceModel = { invoke: vi.fn() };
    const bad = { ...request, postalCode: "1011" };
    await expect(generateServiceRequest({ request: bad, provider }, model)).rejects.toThrow();
    expect(model.invoke).not.toHaveBeenCalled();
  });

  it("rejects a malformed provider before calling the model", async () => {
    const model: ServiceModel = { invoke: vi.fn() };
    const bad = { ...provider, distanceKm: -1 };
    await expect(generateServiceRequest({ request, provider: bad }, model)).rejects.toThrow();
    expect(model.invoke).not.toHaveBeenCalled();
  });

  it("rejects malformed model output", async () => {
    const model: ServiceModel = {
      invoke: vi.fn().mockResolvedValue({ ...validInquiry, matchScore: 999 }),
    };
    await expect(generateServiceRequest({ request, provider }, model)).rejects.toThrow();
  });
});
