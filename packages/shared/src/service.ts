import { z } from "zod";

/** Trades supported by the local service finder. v1 ships Wärmepumpe only. */
export const ServiceTradeSchema = z.enum(["waermepumpe", "pv", "sanitaer"]);
export type ServiceTrade = z.infer<typeof ServiceTradeSchema>;

/**
 * A concrete job the user wants done. The static input to the matcher — the
 * service-finder analogue of {@link UserProfile}.
 */
export const ServiceRequestSchema = z.object({
  trade: ServiceTradeSchema,
  /** German postal code of the property the work is for. */
  postalCode: z.string().regex(/^\d{5}$/, "expected a 5-digit German PLZ"),
  building: z.object({
    type: z.enum(["altbau", "neubau"]),
    heatedAreaM2: z.number().positive(),
    currentHeating: z.enum(["gas", "oel", "nachtspeicher"]),
  }),
  funding: z.object({
    /** Whether the user intends to claim KfW/BAFA (BEG) funding. */
    wantsKfW: z.boolean(),
  }),
  /** Free text, e.g. "Vorlauftemperatur unklar, Heizkörper sollen bleiben". */
  notes: z.string().default(""),
});
export type ServiceRequest = z.infer<typeof ServiceRequestSchema>;

/** Certifications that drive trust + funding eligibility, sourced from registries. */
export const ProviderCertificationSchema = z.enum([
  "energieeffizienz-experte",
  "meisterbetrieb",
  "innung-shk",
  "viessmann-fachpartner",
  "vaillant-fachpartner",
  "bosch-fachpartner",
  "daikin-fachpartner",
]);
export type ProviderCertification = z.infer<typeof ProviderCertificationSchema>;

/**
 * A candidate company. Factual data assembled by the data layer (Places API +
 * registry enrichment) — the service-finder analogue of {@link Listing}.
 */
export const ProviderMatchSchema = z.object({
  /** Stable identifier when known (e.g. the Places id). */
  id: z.string().default(""),
  name: z.string().min(1),
  location: z.object({
    lat: z.number(),
    lng: z.number(),
  }),
  distanceKm: z.number().nonnegative(),
  certifications: z.array(ProviderCertificationSchema).default([]),
  /**
   * Whether this Betrieb can keep a KfW/BAFA application eligible (e.g. listed
   * on the Energieeffizienz-Experten-Liste). The signal Google Maps lacks.
   */
  fundingEligible: z.boolean(),
  /** Source URL when scraped/enriched. */
  url: z.string().url().nullable().default(null),
});
export type ProviderMatch = z.infer<typeof ProviderMatchSchema>;

/**
 * Structured result of a service-finder run: a ready-to-send Anfrage plus the
 * fit assessment. Mirrors {@link ApplicationResponse}. Per the Phase 0 decision,
 * v1 generates this for the user to send — it does not send anything itself.
 */
export const ProviderInquirySchema = z.object({
  subjectLine: z.string().describe("A professional German subject line for the inquiry (Anfrage)."),
  inquiryMessage: z
    .string()
    .describe(
      "The full Anfrage body in formal German ('Sie' form), stating the job and requesting an Angebot, with clean newlines.",
    ),
  matchScore: z
    .number()
    .min(0)
    .max(100)
    .describe("How well the provider fits this job (trade, certifications, funding, distance)."),
  caveats: z
    .array(z.string())
    .describe(
      "Warnings about this match (e.g. 'nicht auf der Energieeffizienz-Experten-Liste → KfW-Förderung gefährdet').",
    ),
  shouldContact: z
    .boolean()
    .describe(
      "False when a critical caveat applies (e.g. KfW wanted but funding eligibility missing).",
    ),
});
export type ProviderInquiry = z.infer<typeof ProviderInquirySchema>;
