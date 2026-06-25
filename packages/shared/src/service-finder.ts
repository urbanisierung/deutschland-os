import { type RankedProvider, rankProviders } from "./provider-scoring.js";
import type { ProviderInquiry, ProviderMatch, ServiceRequest } from "./service.js";
import { generateServiceRequest, type ServiceModel } from "./service-generator.js";

/**
 * End-to-end service-finder step over already-enriched candidates: rank them
 * deterministically, then draft an Anfrage for the single best provider worth
 * contacting. Keeping the LLM call to the top match bounds cost; the full ranked
 * list (with scores and caveats) is always returned so the UI can show the rest.
 *
 * Funding enrichment (Energieeffizienz-Experten-Liste) and candidate discovery
 * (Places API) happen upstream — see {@link enrichProviderFundingEligibility}.
 */
export type DraftedInquiry = {
  providerId: string;
  providerName: string;
  inquiry: ProviderInquiry;
};

export type ServiceFinderResult = {
  ranked: RankedProvider[];
  /** The drafted inquiry for the top contactable provider, or null if none qualifies. */
  topInquiry: DraftedInquiry | null;
};

export async function findAndDraft(
  request: ServiceRequest,
  providers: ProviderMatch[],
  model: ServiceModel,
): Promise<ServiceFinderResult> {
  const ranked = rankProviders(request, providers);
  const best = ranked.find((entry) => entry.score.shouldContact);
  if (!best) return { ranked, topInquiry: null };

  const inquiry = await generateServiceRequest({ request, provider: best.provider }, model);
  return {
    ranked,
    topInquiry: { providerId: best.provider.id, providerName: best.provider.name, inquiry },
  };
}
