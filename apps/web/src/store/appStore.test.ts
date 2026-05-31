import { describe, expect, it } from "vitest";
import { type ManualListing, manualToListing } from "./appStore.js";

const base: ManualListing = {
  title: "  3-Zimmer-Wohnung  ",
  district: "Weingarten",
  coldRent: "1150",
  additionalCosts: "",
  squareMeters: "78,5",
  amenities: "EBK, Balkon , Keller",
  description: "Ruhige Lage.",
};

describe("manualToListing", () => {
  it("trims, parses numbers, and splits amenities", () => {
    const listing = manualToListing(base);
    expect(listing.title).toBe("3-Zimmer-Wohnung");
    expect(listing.coldRent).toBe(1150);
    expect(listing.squareMeters).toBe(78.5);
    expect(listing.amenities).toEqual(["EBK", "Balkon", "Keller"]);
  });

  it("maps empty numeric fields to null", () => {
    const listing = manualToListing(base);
    expect(listing.additionalCosts).toBeNull();
  });
});
