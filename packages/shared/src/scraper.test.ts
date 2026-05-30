import { describe, expect, it } from "vitest";
import { parseGermanNumber, parseListingHtml, scrapeListing } from "./scraper.js";

describe("parseGermanNumber", () => {
  it("parses German-formatted currency and measures", () => {
    expect(parseGermanNumber("1.150,00 €")).toBe(1150);
    expect(parseGermanNumber("78 m²")).toBe(78);
    expect(parseGermanNumber("1150")).toBe(1150);
    expect(parseGermanNumber(220)).toBe(220);
  });

  it("returns null when no number is present", () => {
    expect(parseGermanNumber("auf Anfrage")).toBeNull();
    expect(parseGermanNumber(null)).toBeNull();
  });
});

const jsonLdHtml = `<!doctype html><html><head>
<title>Fallback Title</title>
<script type="application/ld+json">
{
  "@type": "Apartment",
  "name": "Helle 3-Zimmer-Wohnung mit Einbauküche",
  "description": "Ruhige Nachbarschaft, ideal für Berufstätige.",
  "floorSize": { "value": "78", "unitText": "MTK" },
  "offers": { "price": "1150" },
  "address": { "addressLocality": "Weingarten (Baden)" },
  "amenityFeature": [{ "name": "EBK" }, { "name": "Balkon" }]
}
</script>
</head><body></body></html>`;

const metaOnlyHtml = `<!doctype html><html><head>
<meta property="og:title" content="2-Zimmer in Berlin" />
<meta property="og:description" content="Schöne Wohnung in Mitte." />
</head><body><h1>Ignored</h1></body></html>`;

describe("parseListingHtml", () => {
  it("prefers JSON-LD structured data", () => {
    const listing = parseListingHtml(jsonLdHtml, "https://example.com/expose/1");
    expect(listing.title).toBe("Helle 3-Zimmer-Wohnung mit Einbauküche");
    expect(listing.coldRent).toBe(1150);
    expect(listing.squareMeters).toBe(78);
    expect(listing.district).toBe("Weingarten (Baden)");
    expect(listing.amenities).toEqual(["EBK", "Balkon"]);
    expect(listing.url).toBe("https://example.com/expose/1");
  });

  it("falls back to Open Graph meta tags", () => {
    const listing = parseListingHtml(metaOnlyHtml);
    expect(listing.title).toBe("2-Zimmer in Berlin");
    expect(listing.description).toBe("Schöne Wohnung in Mitte.");
    expect(listing.coldRent).toBeNull();
  });

  it("throws when no title can be determined", () => {
    expect(() => parseListingHtml("<html><head></head><body></body></html>")).toThrow(/title/i);
  });
});

describe("scrapeListing", () => {
  it("fetches and parses via an injected fetch", async () => {
    const fetchImpl = async () => ({ ok: true, status: 200, text: async () => jsonLdHtml });
    const listing = await scrapeListing("https://example.com/expose/1", fetchImpl);
    expect(listing.title).toBe("Helle 3-Zimmer-Wohnung mit Einbauküche");
  });

  it("throws on non-ok responses", async () => {
    const fetchImpl = async () => ({ ok: false, status: 404, text: async () => "" });
    await expect(scrapeListing("https://example.com/missing", fetchImpl)).rejects.toThrow(/404/);
  });
});
