#!/usr/bin/env node
/**
 * CLI wrapper around the shared service finder.
 *
 * Runs the full pipeline over supplied candidates: enrich each against the
 * Energieeffizienz-Experten-Liste (funding eligibility), rank deterministically,
 * then draft an Anfrage for the best contactable Betrieb.
 *
 * Usage:
 *   OPENAI_API_KEY=... node --experimental-strip-types find.ts \
 *     --request ./request.json \
 *     --candidates ./candidates.json \
 *     [--locality Berlin] [--umkreis 10]
 *
 * `candidates.json` is an array matching ProviderCandidateSchema (e.g. from the
 * Places API). Eligibility is checked around the request's PLZ within `--umkreis`
 * km (default 10). The script prints `{ ranked, topInquiry }` as JSON.
 */
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import {
  createOpenAIServiceModel,
  enrichProviderFundingEligibility,
  findAndDraft,
  type ProviderCandidate,
  ProviderCandidateSchema,
  type ServiceRequest,
  ServiceRequestSchema,
} from "@deutschland-os/shared";

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      request: { type: "string" },
      candidates: { type: "string" },
      locality: { type: "string" },
      umkreis: { type: "string" },
    },
  });

  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY environment variable is required.");
  }
  if (!values.request || !values.candidates) {
    throw new Error("Both --request <path> and --candidates <path> are required.");
  }

  const request: ServiceRequest = ServiceRequestSchema.parse(await readJson(values.request));
  const rawCandidates = await readJson(values.candidates);
  if (!Array.isArray(rawCandidates)) {
    throw new Error("--candidates must be a JSON array of provider candidates.");
  }
  const candidates: ProviderCandidate[] = rawCandidates.map((c) =>
    ProviderCandidateSchema.parse(c),
  );

  const umkreis = values.umkreis ? Number(values.umkreis) : undefined;
  const providers = await Promise.all(
    candidates.map((candidate) =>
      enrichProviderFundingEligibility(candidate, request.postalCode, {
        locality: values.locality,
        umkreis,
      }),
    ),
  );

  const model = createOpenAIServiceModel({
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL,
  });
  const result = await findAndDraft(request, providers, model);

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
  console.error(`Error: ${(error as Error).message}`);
  process.exit(1);
});
