import type { ProviderMatch, ServiceRequest } from "./service.js";

/**
 * Deterministic pre-ranking of enriched provider candidates against a job.
 *
 * This is the cheap, explainable pass that orders and filters candidates BEFORE
 * any LLM call: it combines funding fit, distance, and certifications into a
 * 0–100 score with human-readable caveats. The generator
 * ({@link generateServiceRequest}) later produces the written Anfrage and its own
 * assessment for the providers this pass surfaces. Pure and side-effect free —
 * no clock, no randomness — so rankings are stable and testable.
 */

/** Beyond this distance the distance sub-score is 0. */
const MAX_DISTANCE_KM = 50;
/** Distance past which a "possibly out of service area" caveat is added. */
const FAR_DISTANCE_KM = 30;
/** Trust certifications counted toward the cert sub-score saturate here. */
const CERT_SATURATION = 3;

/** Component weights; sum to 1. Funding leads — it is the signal Google Maps lacks. */
const WEIGHTS = { funding: 0.45, distance: 0.3, certifications: 0.25 } as const;

export type ProviderScore = {
  /** Overall fit, 0–100. */
  score: number;
  /** False when a critical caveat applies (e.g. KfW wanted but not funding-eligible). */
  shouldContact: boolean;
  /** Human-readable warnings, most severe first. */
  caveats: string[];
  /** Normalized 0–1 sub-scores, exposed for transparency and testing. */
  factors: { funding: number; distance: number; certifications: number };
};

export type RankedProvider = {
  provider: ProviderMatch;
  score: ProviderScore;
};

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const round2 = (value: number): number => Math.round(value * 100) / 100;

/** Trust certifications other than the funding signal (which is scored separately). */
function countTrustCertifications(provider: ProviderMatch): number {
  return provider.certifications.filter((cert) => cert !== "energieeffizienz-experte").length;
}

/**
 * Scores one provider against the job. Funding is decisive when the user wants
 * KfW/BAFA: an ineligible Betrieb scores 0 on that component and is flagged
 * not-to-contact. When funding is not wanted, the funding component is neutral
 * (1) so it neither rewards nor penalizes.
 */
export function scoreProvider(request: ServiceRequest, provider: ProviderMatch): ProviderScore {
  const caveats: string[] = [];
  let shouldContact = true;

  const wantsKfW = request.funding.wantsKfW;
  const fundingFactor = wantsKfW ? (provider.fundingEligible ? 1 : 0) : 1;
  if (wantsKfW && !provider.fundingEligible) {
    caveats.push("Nicht auf der Energieeffizienz-Experten-Liste — KfW/BAFA-Förderung gefährdet.");
    shouldContact = false;
  }

  const distanceFactor = clamp01(1 - provider.distanceKm / MAX_DISTANCE_KM);
  if (provider.distanceKm > FAR_DISTANCE_KM) {
    caveats.push(
      `Betrieb ist ${provider.distanceKm} km entfernt — möglicherweise außerhalb des üblichen Einsatzgebiets.`,
    );
  }

  const trustCerts = countTrustCertifications(provider);
  const certFactor = clamp01(trustCerts / CERT_SATURATION);
  if (trustCerts === 0) {
    caveats.push("Keine Zertifizierungen bekannt (Meisterbetrieb/Innung/Hersteller-Fachpartner).");
  }

  const weighted =
    fundingFactor * WEIGHTS.funding +
    distanceFactor * WEIGHTS.distance +
    certFactor * WEIGHTS.certifications;

  return {
    score: Math.round(weighted * 100),
    shouldContact,
    caveats,
    factors: {
      funding: round2(fundingFactor),
      distance: round2(distanceFactor),
      certifications: round2(certFactor),
    },
  };
}

/**
 * Scores every candidate and returns them ranked best-first. Ties break by
 * shorter distance, then provider name — fully deterministic so the order never
 * shifts between runs on identical input.
 */
export function rankProviders(
  request: ServiceRequest,
  providers: ProviderMatch[],
): RankedProvider[] {
  return providers
    .map((provider) => ({ provider, score: scoreProvider(request, provider) }))
    .sort((a, b) => {
      if (b.score.score !== a.score.score) return b.score.score - a.score.score;
      if (a.provider.distanceKm !== b.provider.distanceKm) {
        return a.provider.distanceKm - b.provider.distanceKm;
      }
      return a.provider.name.localeCompare(b.provider.name);
    });
}
