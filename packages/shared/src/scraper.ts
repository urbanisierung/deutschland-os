import * as cheerio from "cheerio";
import { type Listing, ListingSchema } from "./types.js";

/**
 * Parses a German-formatted monetary/measure string into a number.
 * Handles "1.150,00 €", "78 m²", "1150". Returns null when no digits found.
 */
export function parseGermanNumber(input: unknown): number | null {
  if (typeof input === "number") return Number.isFinite(input) ? input : null;
  if (typeof input !== "string") return null;
  const match = input.replace(/\s/g, "").match(/-?[\d.]+(?:,\d+)?/);
  if (!match) return null;
  const normalized = match[0].replace(/\./g, "").replace(",", ".");
  const value = Number.parseFloat(normalized);
  return Number.isFinite(value) ? value : null;
}

type JsonLdNode = Record<string, unknown>;

function collectJsonLd($: cheerio.CheerioAPI): JsonLdNode[] {
  const nodes: JsonLdNode[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).text().trim();
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      for (const node of Array.isArray(parsed) ? parsed : [parsed]) {
        if (node && typeof node === "object") {
          nodes.push(node as JsonLdNode);
          const graph = (node as JsonLdNode)["@graph"];
          if (Array.isArray(graph)) {
            for (const g of graph) if (g && typeof g === "object") nodes.push(g as JsonLdNode);
          }
        }
      }
    } catch {
      // Malformed JSON-LD blocks are common; skip them silently.
    }
  });
  return nodes;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function extractFromJsonLd(nodes: JsonLdNode[]): Partial<Listing> {
  const result: Partial<Listing> = {};
  for (const node of nodes) {
    const title = asString(node.name) ?? asString(node.headline);
    if (title && !result.title) result.title = title;

    const description = asString(node.description);
    if (description && !result.description) result.description = description;

    const offers = (node.offers ?? node.priceSpecification) as JsonLdNode | undefined;
    const price = parseGermanNumber(node.price ?? offers?.price);
    if (price !== null && result.coldRent == null) result.coldRent = price;

    const floorSize = node.floorSize as JsonLdNode | undefined;
    const size = parseGermanNumber(floorSize?.value ?? node.floorSize);
    if (size !== null && result.squareMeters == null) result.squareMeters = size;

    const address = node.address as JsonLdNode | undefined;
    const district =
      asString(address?.addressLocality) ??
      asString(address?.addressRegion) ??
      asString(node.address);
    if (district && !result.district) result.district = district;

    const features = node.amenityFeature;
    if (Array.isArray(features) && !result.amenities) {
      const names = features
        .map((f) => asString((f as JsonLdNode)?.name))
        .filter((n): n is string => Boolean(n));
      if (names.length > 0) result.amenities = names;
    }
  }
  return result;
}

function extractFromMeta($: cheerio.CheerioAPI): Partial<Listing> {
  const meta = (name: string): string | undefined =>
    asString($(`meta[property="${name}"]`).attr("content")) ??
    asString($(`meta[name="${name}"]`).attr("content"));

  return {
    title:
      meta("og:title") ?? asString($("title").first().text()) ?? asString($("h1").first().text()),
    description: meta("og:description") ?? meta("description"),
  };
}

/**
 * Parses raw listing HTML into a normalized {@link Listing}. Prefers JSON-LD
 * structured data and falls back to Open Graph / meta tags. Throws if no title
 * can be determined, since a title is the minimum viable listing.
 */
export function parseListingHtml(html: string, url: string | null = null): Listing {
  const $ = cheerio.load(html);
  const fromMeta = extractFromMeta($);
  const fromJsonLd = extractFromJsonLd(collectJsonLd($));

  const merged = {
    title: fromJsonLd.title ?? fromMeta.title,
    description: fromJsonLd.description ?? fromMeta.description ?? "",
    coldRent: fromJsonLd.coldRent ?? null,
    additionalCosts: null,
    squareMeters: fromJsonLd.squareMeters ?? null,
    district: fromJsonLd.district ?? "",
    amenities: fromJsonLd.amenities ?? [],
    url,
  };

  if (!merged.title) {
    throw new Error("Could not extract a listing title from the provided HTML.");
  }

  return ListingSchema.parse(merged);
}

export type FetchLike = (
  url: string,
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

/**
 * Fetches a listing URL and parses it into a {@link Listing}. The fetch
 * implementation is injectable for testing; defaults to the global `fetch`.
 */
export async function scrapeListing(url: string, fetchImpl: FetchLike = fetch): Promise<Listing> {
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch listing (${response.status}): ${url}`);
  }
  const html = await response.text();
  return parseListingHtml(html, url);
}
