import { z } from "zod";
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
