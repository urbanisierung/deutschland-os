import {
  createOpenAIServiceModel,
  findAndDraft,
  ServiceFinderRequestSchema,
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

  const parsed = ServiceFinderRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return json({ error: "Invalid request.", issues: parsed.error.issues }, 400);
  }

  try {
    const model = createOpenAIServiceModel({ apiKey, model: import.meta.env.OPENAI_MODEL });
    const result = await findAndDraft(parsed.data.request, parsed.data.providers, model);
    return json(result, 200);
  } catch (error) {
    return json({ error: `Service finder failed: ${(error as Error).message}` }, 502);
  }
};
