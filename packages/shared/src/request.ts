import { z } from "zod";
import { ProviderMatchSchema, ServiceRequestSchema } from "./service.js";
import { ListingSchema, UserProfileSchema } from "./types.js";

/** Either a URL to scrape or a manually entered, already-structured listing. */
export const ListingSourceSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("url"), url: z.string().url() }),
  z.object({ type: z.literal("manual"), listing: ListingSchema }),
]);

export type ListingSource = z.infer<typeof ListingSourceSchema>;

/** Wire contract for the web app's POST /api/generate endpoint. */
export const GenerateRequestSchema = z.object({
  profile: UserProfileSchema,
  source: ListingSourceSchema,
});

export type GenerateRequest = z.infer<typeof GenerateRequestSchema>;

/**
 * Wire contract for the service-finder endpoint: a job plus the (already
 * enriched) provider candidates to rank and draft an inquiry for.
 */
export const ServiceFinderRequestSchema = z.object({
  request: ServiceRequestSchema,
  providers: z.array(ProviderMatchSchema).min(1),
});

export type ServiceFinderRequest = z.infer<typeof ServiceFinderRequestSchema>;
