#!/usr/bin/env node
/**
 * CLI wrapper around the shared application generator.
 *
 * Usage:
 *   OPENAI_API_KEY=... node --experimental-strip-types generate.ts \
 *     --profile ./profile.json \
 *     --url "https://www.immobilienscout24.de/expose/12345"
 *
 *   ...or supply a pre-structured listing instead of a URL:
 *     --listing ./listing.json
 */
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import {
  createOpenAIApplicationModel,
  generateApplication,
  type Listing,
  ListingSchema,
  scrapeListing,
  type UserProfile,
  UserProfileSchema,
} from "@deutschland-os/shared";

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      profile: { type: "string" },
      url: { type: "string" },
      listing: { type: "string" },
    },
  });

  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY environment variable is required.");
  }
  if (!values.profile) {
    throw new Error("--profile <path-to-profile.json> is required.");
  }
  if (!values.url && !values.listing) {
    throw new Error("Provide either --url <listing-url> or --listing <path-to-listing.json>.");
  }

  const profile: UserProfile = UserProfileSchema.parse(await readJson(values.profile));
  const listing: Listing = values.url
    ? await scrapeListing(values.url)
    : ListingSchema.parse(await readJson(values.listing as string));

  const model = createOpenAIApplicationModel({
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL,
  });
  const result = await generateApplication({ profile, listing }, model);

  console.log(JSON.stringify({ listing, result }, null, 2));
}

main().catch((error: unknown) => {
  console.error(`Error: ${(error as Error).message}`);
  process.exit(1);
});
