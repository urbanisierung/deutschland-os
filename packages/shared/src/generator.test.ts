import { describe, expect, it, vi } from "vitest";
import { type ApplicationModel, buildHumanPrompt, generateApplication } from "./generator.js";
import type { ApplicationResponse, Listing, UserProfile } from "./types.js";

const profile: UserProfile = {
  fullName: "Adam",
  profession: "Senior Cloud Platform & Software Developer",
  employmentStatus: "Unbefristet",
  householdSize: 3,
  hasChildren: true,
  hasPets: false,
  monthlyNetIncome: 6500,
  moveInDate: "Ab sofort",
  additionalNotes: "Ruhiger Mieter, Nichtraucher.",
};

const listing: Listing = {
  id: "immoscout-14839201",
  title: "Helle 3-Zimmer-Wohnung mit Einbauküche",
  coldRent: 1150,
  additionalCosts: 220,
  squareMeters: 78,
  district: "Weingarten (Baden)",
  description: "Ruhige Nachbarschaft. Einbauküche (EBK) vorhanden.",
  amenities: ["EBK", "Balkon"],
  url: null,
};

const validResponse: ApplicationResponse = {
  subjectLine: "Bewerbung für die 3-Zimmer-Wohnung in Weingarten",
  coverLetter: "Sehr geehrte Damen und Herren,\n\n...\n\nMit freundlichen Grüßen\nAdam",
  confidenceScore: 88,
  redFlagsDetected: [],
  shouldApply: true,
};

describe("buildHumanPrompt", () => {
  it("includes profile and listing facts", () => {
    const prompt = buildHumanPrompt({ profile, listing });
    expect(prompt).toContain("Adam");
    expect(prompt).toContain("1150 EUR Kalt");
    expect(prompt).toContain("78 m²");
    expect(prompt).toContain("EBK, Balkon");
  });

  it("renders missing numeric fields as 'k. A.'", () => {
    const sparse: Listing = { ...listing, coldRent: null, squareMeters: null, amenities: [] };
    const prompt = buildHumanPrompt({ profile, listing: sparse });
    expect(prompt).toContain("Rent: k. A. / 220 EUR Nebenkosten");
    expect(prompt).toContain("Size: k. A.");
    expect(prompt).toContain("Amenities: k. A.");
  });
});

describe("generateApplication", () => {
  it("validates input, calls the model, and validates output", async () => {
    const model: ApplicationModel = { invoke: vi.fn().mockResolvedValue(validResponse) };
    const result = await generateApplication({ profile, listing }, model);
    expect(result).toEqual(validResponse);
    expect(model.invoke).toHaveBeenCalledOnce();
  });

  it("rejects invalid profile input before calling the model", async () => {
    const model: ApplicationModel = { invoke: vi.fn() };
    const bad = { ...profile, householdSize: -1 };
    await expect(generateApplication({ profile: bad, listing }, model)).rejects.toThrow();
    expect(model.invoke).not.toHaveBeenCalled();
  });

  it("rejects malformed model output", async () => {
    const model: ApplicationModel = {
      invoke: vi.fn().mockResolvedValue({ ...validResponse, confidenceScore: 999 }),
    };
    await expect(generateApplication({ profile, listing }, model)).rejects.toThrow();
  });
});
