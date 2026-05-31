import { describe, expect, it, vi } from "vitest";
import {
  createFetcherFromEnv,
  createGateway,
  createResilientFetcher,
  parseRetryAfter,
  withCache,
} from "./fetcher.js";

type FetchArgs = { url: string; init?: RequestInit };

/** Builds a fake `fetch` that returns the given responses in order. */
function fakeFetch(responses: Array<Partial<Response> | Error>) {
  const calls: FetchArgs[] = [];
  let i = 0;
  const impl = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const next = responses[Math.min(i, responses.length - 1)];
    i++;
    if (next instanceof Error) throw next;
    return next as Response;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const ok = (body = "<html><title>x</title></html>"): Partial<Response> => ({
  ok: true,
  status: 200,
  headers: new Headers(),
  text: async () => body,
});

describe("parseRetryAfter", () => {
  it("parses delta-seconds", () => {
    expect(parseRetryAfter("5", 0)).toBe(5000);
  });
  it("parses an HTTP date relative to now", () => {
    const now = Date.parse("2026-01-01T00:00:00Z");
    expect(parseRetryAfter("Thu, 01 Jan 2026 00:00:10 GMT", now)).toBe(10000);
  });
  it("returns null for missing or invalid values", () => {
    expect(parseRetryAfter(null, 0)).toBeNull();
    expect(parseRetryAfter("not-a-date", 0)).toBeNull();
  });
});

describe("createResilientFetcher", () => {
  it("sends browser headers and rotates the User-Agent per request", async () => {
    const { impl, calls } = fakeFetch([{ ok: false, status: 503, headers: new Headers() }, ok()]);
    const fetcher = createResilientFetcher({
      fetchImpl: impl,
      sleep: async () => {},
      userAgents: ["UA-1", "UA-2"],
    });
    await fetcher("https://example.com/x");

    const h0 = calls[0]?.init?.headers as Record<string, string>;
    const h1 = calls[1]?.init?.headers as Record<string, string>;
    expect(h0["User-Agent"]).toBe("UA-1");
    expect(h1["User-Agent"]).toBe("UA-2");
    expect(h0["Accept-Language"]).toContain("de-DE");
  });

  it("retries retryable statuses then succeeds", async () => {
    const { impl, calls } = fakeFetch([
      { ok: false, status: 503, headers: new Headers() },
      { ok: false, status: 429, headers: new Headers() },
      ok(),
    ]);
    const sleep = vi.fn(async () => {});
    const fetcher = createResilientFetcher({ fetchImpl: impl, sleep, retries: 3, random: () => 0 });
    const res = await fetcher("https://example.com/x");
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("retries network errors and rethrows after exhausting attempts", async () => {
    const { impl, calls } = fakeFetch([new Error("ECONNRESET")]);
    const fetcher = createResilientFetcher({ fetchImpl: impl, sleep: async () => {}, retries: 2 });
    await expect(fetcher("https://example.com/x")).rejects.toThrow("ECONNRESET");
    expect(calls).toHaveLength(3);
  });

  it("does not retry non-retryable statuses", async () => {
    const { impl, calls } = fakeFetch([{ ok: false, status: 404, headers: new Headers() }]);
    const fetcher = createResilientFetcher({ fetchImpl: impl, sleep: async () => {} });
    const res = await fetcher("https://example.com/x");
    expect(res.status).toBe(404);
    expect(calls).toHaveLength(1);
  });

  it("honors Retry-After when backing off", async () => {
    const headers = new Headers({ "retry-after": "2" });
    const { impl } = fakeFetch([{ ok: false, status: 429, headers }, ok()]);
    const sleep = vi.fn(async () => {});
    const fetcher = createResilientFetcher({ fetchImpl: impl, sleep, backoffCapMs: 10000 });
    await fetcher("https://example.com/x");
    expect(sleep).toHaveBeenCalledWith(2000);
  });
});

describe("createGateway", () => {
  it("substitutes the encoded url and api key", () => {
    const gateway = createGateway({
      template: "https://api.scraperapi.com/?api_key={key}&url={url}",
      apiKey: "secret",
    });
    expect(gateway("https://immo.de/a?b=1").url).toBe(
      "https://api.scraperapi.com/?api_key=secret&url=https%3A%2F%2Fimmo.de%2Fa%3Fb%3D1",
    );
  });
});

describe("withCache", () => {
  it("serves a cached body within the TTL and re-fetches after it expires", async () => {
    let clock = 1000;
    const underlying = vi.fn(async () => ok("cached-body") as unknown as Response);
    const fetcher = withCache(underlying as never, { ttlMs: 5000, now: () => clock });

    const first = await fetcher("https://example.com/x");
    expect(await first.text()).toBe("cached-body");
    await fetcher("https://example.com/x"); // within TTL → cache hit
    expect(underlying).toHaveBeenCalledTimes(1);

    clock += 6000; // past TTL
    await fetcher("https://example.com/x");
    expect(underlying).toHaveBeenCalledTimes(2);
  });

  it("does not cache failed responses", async () => {
    const underlying = vi.fn(async () => ({ ok: false, status: 503 }) as unknown as Response);
    const fetcher = withCache(underlying as never, { ttlMs: 5000, now: () => 0 });
    await fetcher("https://example.com/x");
    await fetcher("https://example.com/x");
    expect(underlying).toHaveBeenCalledTimes(2);
  });
});

describe("createFetcherFromEnv", () => {
  it("builds a gateway-routed fetcher from environment variables", async () => {
    const { impl, calls } = fakeFetch([ok()]);
    // Patch the global fetch so the env fetcher (which closes over global fetch) uses our stub.
    const original = globalThis.fetch;
    globalThis.fetch = impl;
    try {
      const fetcher = createFetcherFromEnv({
        SCRAPER_GATEWAY_TEMPLATE: "https://proxy.test/?url={url}",
        SCRAPER_RETRIES: "0",
      });
      await fetcher("https://immo.de/x");
      expect(calls[0]?.url).toBe("https://proxy.test/?url=https%3A%2F%2Fimmo.de%2Fx");
    } finally {
      globalThis.fetch = original;
    }
  });
});
