import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import {
  type ProviderInquiry,
  ProviderInquirySchema,
  type ProviderMatch,
  ProviderMatchSchema,
  type ServiceRequest,
  ServiceRequestSchema,
} from "./service.js";

export type ServiceGenerationInput = {
  request: ServiceRequest;
  provider: ProviderMatch;
};

/**
 * Abstraction over the LLM call. Injected into {@link generateServiceRequest} so
 * the orchestration/validation can be tested without a live OpenAI key.
 */
export interface ServiceModel {
  invoke(input: ServiceGenerationInput): Promise<ProviderInquiry>;
}

export const SERVICE_SYSTEM_PROMPT = `You are a professional assistant that helps a homeowner in Germany contact local trade companies (Handwerksbetriebe) for a concrete job.
Your task is to write a flawless, tailored inquiry (Anfrage) to one company and assess how well that company fits the job.

CRITICAL INSTRUCTIONS:
1. Tone: Exceptionally polite, professional, formal German address ("Sie").
2. Anti-Fluff: No emotional or AI marketing fluff. State the job concretely and ask for a quote (Angebot) and a site visit (Vor-Ort-Termin) where appropriate.
3. Facts: Reference the concrete job data (trade, building, current heating, area). Do not invent details that were not provided.
4. Funding: If the user wants KfW/BAFA (BEG) funding, ask the company to confirm it can issue the required Fachunternehmererklärung and keep the application eligible.
5. Fit assessment: Set matchScore (0-100) from trade fit, certifications, funding eligibility, and distance. Add caveats for risks. If the user wants KfW funding but the company is not funding-eligible, that is a critical caveat — set shouldContact to false.`;

/** Pure, testable rendering of the request + provider into the human turn. */
export function buildServiceHumanPrompt({ request, provider }: ServiceGenerationInput): string {
  const certs =
    provider.certifications.length > 0 ? provider.certifications.join(", ") : "keine bekannt";

  return `### AUFTRAG (was der Nutzer benötigt)
Gewerk: ${request.trade}
PLZ: ${request.postalCode}
Gebäude: ${request.building.type}, ${request.building.heatedAreaM2} m² beheizte Fläche
Aktuelle Heizung: ${request.building.currentHeating}
KfW/BAFA-Förderung gewünscht: ${request.funding.wantsKfW ? "ja" : "nein"}
Hinweise: ${request.notes || "—"}

### BETRIEB (Kandidat)
Name: ${provider.name}
Entfernung: ${provider.distanceKm} km
Zertifizierungen: ${certs}
Förderfähig (KfW/BAFA): ${provider.fundingEligible ? "ja" : "nein"}

Generate the structured response according to the requested schema.`;
}

export type OpenAIServiceModelConfig = {
  model?: string;
  temperature?: number;
  apiKey?: string;
};

/**
 * Builds the concrete OpenAI-backed model using LangChain's native structured
 * output. Messages are constructed directly (not via templates) so that scraped
 * provider text containing `{`/`}` cannot break prompt interpolation.
 */
export function createOpenAIServiceModel(config: OpenAIServiceModelConfig = {}): ServiceModel {
  const llm = new ChatOpenAI({
    model: config.model ?? "gpt-4o-mini",
    temperature: config.temperature ?? 0.2,
    apiKey: config.apiKey,
  });
  const structured = llm.withStructuredOutput(ProviderInquirySchema, {
    name: "provider_inquiry_parser",
  });

  return {
    async invoke(input) {
      const result = await structured.invoke([
        new SystemMessage(SERVICE_SYSTEM_PROMPT),
        new HumanMessage(buildServiceHumanPrompt(input)),
      ]);
      return result as ProviderInquiry;
    },
  };
}

/**
 * Validates inputs, runs the model, and validates the structured output. The
 * model is injectable; in production pass {@link createOpenAIServiceModel}.
 */
export async function generateServiceRequest(
  input: ServiceGenerationInput,
  model: ServiceModel,
): Promise<ProviderInquiry> {
  const request = ServiceRequestSchema.parse(input.request);
  const provider = ProviderMatchSchema.parse(input.provider);
  const result = await model.invoke({ request, provider });
  return ProviderInquirySchema.parse(result);
}
