import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import {
  type ApplicationResponse,
  ApplicationResponseSchema,
  type Listing,
  ListingSchema,
  type UserProfile,
  UserProfileSchema,
} from "./types.js";

export type GenerationInput = {
  profile: UserProfile;
  listing: Listing;
};

/**
 * Abstraction over the LLM call. Injected into {@link generateApplication} so
 * the orchestration/validation can be tested without a live OpenAI key.
 */
export interface ApplicationModel {
  invoke(input: GenerationInput): Promise<ApplicationResponse>;
}

export const SYSTEM_PROMPT = `You are an elite, highly professional real estate application assistant operating in Germany.
Your sole task is to generate a flawless, highly tailored application message for a rental property based on the provided User Profile and the Scraped Listing Data.

CRITICAL INSTRUCTIONS:
1. Tone: Must be exceptionally polite, professional, and use the formal German address ("Sie").
2. Anti-Fluff: Avoid overly emotional or enthusiastic AI marketing fluff (e.g. avoid "ich habe mich sofort in Ihre wunderschöne Wohnung verliebt"). Be confident, professional, and clear.
3. Matching Logic: Dynamically weave in matching elements (e.g. if the listing mentions a quiet neighborhood, highlight that the applicant is a quiet tenant).
4. Formatting: Use traditional German letter layout spacing with clean newlines.
5. Pre-Filtering: Detect red flags (Tauschwohnung, Indexmiete, Staffelmiete, missing kitchen, short-term sublet, explicit exclusions) and set shouldApply to false when a critical one applies.`;

/** Pure, testable rendering of the listing + profile into the human turn. */
export function buildHumanPrompt({ profile, listing }: GenerationInput): string {
  const fmt = (value: number | null, suffix: string): string =>
    value === null ? "k. A." : `${value} ${suffix}`;

  return `### USER PROFILE
Name: ${profile.fullName}
Profession: ${profile.profession}
Contract Type: ${profile.employmentStatus}
Net Monthly Income: ${profile.monthlyNetIncome} EUR
Household Size: ${profile.householdSize}
Children: ${profile.hasChildren ? "ja" : "nein"}
Pets: ${profile.hasPets ? "ja" : "nein"}
Move-in Date: ${profile.moveInDate}
Notes: ${profile.additionalNotes || "—"}

### SCRAPED LISTING DATA
Title: ${listing.title}
Location: ${listing.district || "k. A."}
Rent: ${fmt(listing.coldRent, "EUR Kalt")} / ${fmt(listing.additionalCosts, "EUR Nebenkosten")}
Size: ${fmt(listing.squareMeters, "m²")}
Amenities: ${listing.amenities.length > 0 ? listing.amenities.join(", ") : "k. A."}
Description: ${listing.description || "k. A."}

Generate the structured response according to the requested schema.`;
}

export type OpenAIModelConfig = {
  model?: string;
  temperature?: number;
  apiKey?: string;
};

/**
 * Builds the concrete OpenAI-backed model using LangChain's native structured
 * output. Messages are constructed directly (not via templates) so that scraped
 * text containing `{`/`}` cannot break prompt interpolation.
 */
export function createOpenAIApplicationModel(config: OpenAIModelConfig = {}): ApplicationModel {
  const llm = new ChatOpenAI({
    model: config.model ?? "gpt-4o-mini",
    temperature: config.temperature ?? 0.2,
    apiKey: config.apiKey,
  });
  const structured = llm.withStructuredOutput(ApplicationResponseSchema, {
    name: "application_parser",
  });

  return {
    async invoke(input) {
      const result = await structured.invoke([
        new SystemMessage(SYSTEM_PROMPT),
        new HumanMessage(buildHumanPrompt(input)),
      ]);
      return result as ApplicationResponse;
    },
  };
}

/**
 * Validates inputs, runs the model, and validates the structured output. The
 * model is injectable; in production pass {@link createOpenAIApplicationModel}.
 */
export async function generateApplication(
  input: GenerationInput,
  model: ApplicationModel,
): Promise<ApplicationResponse> {
  const profile = UserProfileSchema.parse(input.profile);
  const listing = ListingSchema.parse(input.listing);
  const result = await model.invoke({ profile, listing });
  return ApplicationResponseSchema.parse(result);
}
