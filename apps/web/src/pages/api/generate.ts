import {
  createOpenAIApplicationModel,
  GenerateRequestSchema,
  generateApplication,
  type Listing,
  scrapeListing,
} from "@deutschland-os/shared";
import type { APIRoute } from "astro";

export const prerender = false;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export const POST: APIRoute = async ({ request }) => {
  const apiKey = import.meta.env.OPENAI_API_KEY;
  if (!apiKey) {
    return json({ error: "OPENAI_API_KEY is not configured on the server." }, 500);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Request body must be valid JSON." }, 400);
  }

  const parsed = GenerateRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return json({ error: "Invalid request.", issues: parsed.error.issues }, 400);
  }

  const { profile, source } = parsed.data;

  let listing: Listing;
  try {
    listing = source.type === "url" ? await scrapeListing(source.url) : source.listing;
  } catch (error) {
    return json({ error: `Could not load listing: ${(error as Error).message}` }, 422);
  }

  try {
    const model = createOpenAIApplicationModel({
      apiKey,
      model: import.meta.env.OPENAI_MODEL,
    });
    const result = await generateApplication({ profile, listing }, model);
    return json({ listing, result }, 200);
  } catch (error) {
    return json({ error: `Generation failed: ${(error as Error).message}` }, 502);
  }
};
