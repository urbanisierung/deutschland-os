import { z } from "zod";

/**
 * Static personal context the applicant provides once. Reused across every
 * generated application message.
 */
export const UserProfileSchema = z.object({
  fullName: z.string().min(1),
  profession: z.string().min(1),
  /** e.g. "Unbefristet" (permanent) / "Befristet" (fixed-term) / "Selbstständig". */
  employmentStatus: z.string().min(1),
  householdSize: z.number().int().positive(),
  hasChildren: z.boolean(),
  hasPets: z.boolean(),
  /** Combined household net income per month in EUR. */
  monthlyNetIncome: z.number().nonnegative(),
  /** Free text, e.g. "Ab sofort", "01.08.2026", "Flexibel". */
  moveInDate: z.string().min(1),
  additionalNotes: z.string().default(""),
});

export type UserProfile = z.infer<typeof UserProfileSchema>;

/**
 * A normalized rental listing. Either supplied directly by the caller or
 * produced by the scraper from a listing URL / raw HTML.
 */
export const ListingSchema = z.object({
  /** Stable identifier when known (e.g. the portal's exposé id). */
  id: z.string().default(""),
  title: z.string().min(1),
  /** Kaltmiete in EUR. */
  coldRent: z.number().nonnegative().nullable(),
  /** Nebenkosten in EUR. */
  additionalCosts: z.number().nonnegative().nullable(),
  squareMeters: z.number().positive().nullable(),
  district: z.string().default(""),
  description: z.string().default(""),
  amenities: z.array(z.string()).default([]),
  /** Source URL when scraped. */
  url: z.string().url().nullable().default(null),
});

export type Listing = z.infer<typeof ListingSchema>;

/**
 * Structured result of a generation run. Mirrors the contract the downstream
 * consumer (web UI, notification pipeline) relies on.
 */
export const ApplicationResponseSchema = z.object({
  subjectLine: z
    .string()
    .describe("A professional German subject line for the application message."),
  coverLetter: z
    .string()
    .describe(
      "The full body of the cover letter in formal German ('Sie' form), with clean newlines.",
    ),
  confidenceScore: z
    .number()
    .min(0)
    .max(100)
    .describe("How well the profile matches the landlord's explicit constraints."),
  redFlagsDetected: z
    .array(z.string())
    .describe(
      "Warning items found in the listing (e.g. Tauschwohnung, Indexmiete, missing kitchen).",
    ),
  shouldApply: z
    .boolean()
    .describe("False if critical red flags apply or the profile is explicitly excluded."),
});

export type ApplicationResponse = z.infer<typeof ApplicationResponseSchema>;
