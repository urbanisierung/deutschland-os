Below is a production-ready TypeScript execution script using the modern @langchain/core and @langchain/openai SDKs. It demonstrates how to combine your static personal context, the scraped property payload, and a rigid system prompt using the official Zod-driven structured output pattern.

Prerequisites
Ensure you have your dependencies installed:

Bash
pnpm add @langchain/core @langchain/openai zod dotenv
The Implementation Script
TypeScript
import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate, SystemMessagePromptTemplate, HumanMessagePromptTemplate } from "@langchain/core/prompts";
import { z } from "zod";
import * as dotenv from "dotenv";

// Load environment variables (OPENAI_API_KEY)
dotenv.config();

// 1. Define the Strict Structured Output Schema using Zod
// This ensures the LLM returns deterministic JSON matching your app's needs.
const ApplicationResponseSchema = z.object({
  subjectLine: z.string().describe("A professional German subject line for the application message."),
  coverLetter: z.string().describe("The full body of the cover letter in formal German ('Sie' form), properly formatted with newlines."),
  confidenceScore: z.number().min(0).max(100).describe("Score evaluating how well the user profile matches the landlord's explicit constraints."),
  redFlagsDetected: z.array(z.string()).describe("Any warning items found in the listing (e.g., Tauschwohnung, Indexmiete, missing kitchen)."),
  shouldApply: z.boolean().describe("False if critical red flags match or if the user is explicitly excluded by the listing text."),
});

// Type inference from our schema
type ApplicationResponse = z.infer<typeof ApplicationResponseSchema>;

// 2. Sample Data Inputs (Simulating Scraped Payload & Profile)
const sampleScrapedListing = {
  id: "immoscout-14839201",
  title: "Helle 3-Zimmer-Wohnung mit Einbauküche in ruhiger Lage",
  coldRent: 1150,
  additionalCosts: 220,
  squareMeters: 78,
  district: "Weingarten (Baden)",
  description: "Die Wohnung befindet sich im 2. OG eines gepflegten Mehrfamilienhauses. Einbauküche (EBK) vorhanden. Ruhige Nachbarschaft, ideal für Berufstätige. Haustiere nach Absprache. Bitte senden Sie uns eine aussagekräftige Nachricht mit Angaben zu Ihrer beruflichen Situation.",
  amenities: ["EBK", "Balkon", "Keller"]
};

const userProfile = {
  fullName: "Adam",
  profession: "Senior Cloud Platform & Software Developer",
  employmentStatus: "Unbefristet (Permanent contract)",
  householdSize: 3,
  hasChildren: true,
  hasPets: false,
  monthlyNetIncome: 6500, // Combined/Individual household net
  moveInDate: "Ab sofort / Flexibel",
  additionalNotes: "Ruhiger Mieter, Nichtraucher, handwerklich geschickt."
};

async function generateApplication() {
  // 3. Initialize the Model
  // Using gpt-4o-mini for sub-2-second latency and great compliance with structured inputs
  const model = new ChatOpenAI({
    modelName: "gpt-4o-mini",
    temperature: 0.2, // Low temperature for factual compliance over wild creativity
  });

  // 4. Construct the Prompt Template
  const systemPrompt = `You are an elite, highly professional real estate application assistant operating in Germany.
Your sole task is to generate a flawless, highly tailored application message for a rental property based on the provided User Profile and the Scraped Listing Data.

CRITICAL INSTRUCTIONS:
1. Tone: Must be exceptionally polite, professional, and use the formal German address ("Sie"). 
2. Anti-Fluff: Avoid overly emotional or enthusiastic AI marketing fluff (e.g., avoid "ich habe mich sofort in Ihre wunderschöne Wohnung verliebt"). Be confident, professional, and clear.
3. Matching Logic: Dynamically weave in matching elements (e.g., if the listing mentions a quiet neighborhood, highlight that the applicant is a quiet tenant).
4. Formatting: Ensure the cover letter text uses traditional German letter layout spacing with clean newlines.`;

  const humanPrompt = `### USER PROFILE
Name: {fullName}
Profession: {profession}
Contract Type: {employmentStatus}
Net Monthly Income: {monthlyNetIncome} EUR
Household Size: {householdSize}
Move-in Date: {moveInDate}
Notes: {additionalNotes}

### SCRAPED LISTING DATA
Title: {title}
Location: {district}
Rent: {coldRent} EUR Cold / {additionalCosts} EUR Nebenkosten
Size: {squareMeters} m²
Description: {description}
Amenities: {amenities}

Generate the structured JSON response according to the requested schema layout.`;

  const promptTemplate = ChatPromptTemplate.fromMessages([
    SystemMessagePromptTemplate.fromTemplate(systemPrompt),
    HumanMessagePromptTemplate.fromTemplate(humanPrompt)
  ]);

  // 5. Bind the Schema to the Model (Structured Output API)
  const structuredModel = model.withStructuredOutput(ApplicationResponseSchema, {
    name: "application_parser"
  });

  // 6. Create the Execution Chain
  const chain = promptTemplate.pipe(structuredModel);

  try {
    console.log(`✨ Processing listing ID: ${sampleScrapedListing.id}...`);
    const startTime = Date.now();

    // Execute the pipeline
    const result: ApplicationResponse = await chain.invoke({
      // Flattened parameters for the prompt templates
      fullName: userProfile.fullName,
      profession: userProfile.profession,
      employmentStatus: userProfile.employmentStatus,
      monthlyNetIncome: userProfile.monthlyNetIncome,
      householdSize: userProfile.householdSize,
      moveInDate: userProfile.moveInDate,
      additionalNotes: userProfile.additionalNotes,
      title: sampleScrapedListing.title,
      district: sampleScrapedListing.district,
      coldRent: sampleScrapedListing.coldRent,
      additionalCosts: sampleScrapedListing.additionalCosts,
      squareMeters: sampleScrapedListing.squareMeters,
      description: sampleScrapedListing.description,
      amenities: sampleScrapedListing.amenities.join(", ")
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ Generation completed successfully in ${duration}s.\n`);

    // 7. Output the exact structured results
    console.log("=========================================");
    console.log(`🎯 Match Confidence: ${result.confidenceScore}%`);
    console.log(`🚦 Should Apply: ${result.shouldApply ? "YES" : "NO"}`);
    if (result.redFlagsDetected.length > 0) {
      console.log(`⚠️ Red Flags Found: ${result.redFlagsDetected.join(", ")}`);
    }
    console.log("=========================================\n");
    console.log(`Betreff: ${result.subjectLine}\n`);
    console.log(result.coverLetter);
    console.log("\n=========================================");

  } catch (error) {
    console.error("❌ Execution chain failed:", error);
  }
}

// Run the script
generateApplication();
Key Architectural Highlights of this Script
Deterministic Contract (withStructuredOutput): Instead of manually appending parsing instructions like "return JSON only" to the end of your prompt, this pattern uses OpenAI's Native Structured Outputs. The LLM is strictly constrained by a context-free grammar to only return valid tokens matching your Zod matrix.

Low Latency Tuning: Setting temperature: 0.2 paired with gpt-4o-mini keeps execution speeds blazing fast (typically under 1.5 seconds) while drastically reducing hallucinations and keeping the wording grounded in realistic business German.

Pre-Filtering Layer: The inclusion of redFlagsDetected and shouldApply inside the schema enables your downstream message consumer to completely ignore listings that turn out to be swap proposals (Tauschwohnungen) or short-term sublets before it ever triggers a notification on your end.