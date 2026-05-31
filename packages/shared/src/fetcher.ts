/**
 * Resilient HTTP fetching for the scraper.
 *
 * Real estate portals routinely block naive scrapers. This module layers the
 * practical, in-code anti-blocking measures (realistic + rotating browser
 * headers, timeouts, retries with backoff that honor `Retry-After`) and exposes
 * a pluggable {@link Gateway} so requests can be routed through rotating
 * residential proxies or a managed scraping API — the only reliable way past
 * advanced bot protection such as DataDome (ImmoScout24). A {@link withCache}
 * wrapper keeps data available even when the origin is briefly unreachable.
 *
 * Every source of nondeterminism (sleep, jitter, clock, UA selection order) is
 * injectable so the behavior is fully testable.
 */

/** Minimal response shape the scraper needs; the global `fetch` Response satisfies it. */
export type HttpResponse = {
  ok: boolean;
  status: number;
  headers?: { get(name: string): string | null };
  text(): Promise<string>;
};

export type FetchLike = (url: string) => Promise<HttpResponse>;

/**
 * Rewrites a target URL into the request that is actually sent. Use it to route
 * through a proxy or managed scraping API. Returning extra headers lets the
 * gateway inject auth.
 */
export type Gateway = (targetUrl: string) => { url: string; headers?: Record<string, string> };

/** Current desktop browser User-Agents, rotated round-robin to avoid a single fingerprint. */
const DEFAULT_USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
];

/** Statuses worth retrying: transient server errors, timeouts, and rate limits. */
const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

/** Realistic navigation headers a desktop browser sends, tuned for German portals. */
function browserHeaders(userAgent: string): Record<string, string> {
  return {
    "User-Agent": userAgent,
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
  };
}

/** Parses a `Retry-After` value (delta-seconds or HTTP date) into milliseconds. */
export function parseRetryAfter(value: string | null | undefined, now: number): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, date - now);
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export type ResilientFetcherOptions = {
  /** Underlying fetch (defaults to the global `fetch`). */
  fetchImpl?: typeof fetch;
  /** Retry attempts after the first try. Default 3 (so up to 4 requests). */
  retries?: number;
  /** Per-request timeout in ms. Default 15000. */
  timeoutMs?: number;
  /** Base backoff in ms (doubled each attempt). Default 500. */
  backoffBaseMs?: number;
  /** Maximum backoff in ms. Default 10000. */
  backoffCapMs?: number;
  /** User-Agent pool, rotated round-robin. */
  userAgents?: string[];
  /** Extra headers merged over the browser defaults. */
  headers?: Record<string, string>;
  /** Routes requests through a proxy / scraping API. */
  gateway?: Gateway;
  /** Injectable delay (tests pass a no-op). */
  sleep?: (ms: number) => Promise<void>;
  /** Injectable randomness for jitter (tests pass a constant). */
  random?: () => number;
};

/**
 * Builds a {@link FetchLike} that rotates browser fingerprints, times out, and
 * retries transient failures with jittered exponential backoff (honoring
 * `Retry-After`). On exhausting retries it returns the last response (so the
 * caller can inspect the status) or rethrows the last network error.
 */
export function createResilientFetcher(options: ResilientFetcherOptions = {}): FetchLike {
  const {
    fetchImpl = fetch,
    retries = 3,
    timeoutMs = 15000,
    backoffBaseMs = 500,
    backoffCapMs = 10000,
    userAgents = DEFAULT_USER_AGENTS,
    headers: extraHeaders = {},
    gateway,
    sleep = defaultSleep,
    random = Math.random,
  } = options;

  let uaIndex = 0;

  const delayFor = (attempt: number, response: HttpResponse | undefined): number => {
    const retryAfter = parseRetryAfter(response?.headers?.get("retry-after"), Date.now());
    if (retryAfter !== null) return Math.min(retryAfter, backoffCapMs);
    const exponential = Math.min(backoffBaseMs * 2 ** attempt, backoffCapMs);
    return exponential + Math.floor(random() * backoffBaseMs);
  };

  return async (targetUrl) => {
    let lastResponse: HttpResponse | undefined;
    let lastError: unknown;

    for (let attempt = 0; attempt <= retries; attempt++) {
      const userAgent = userAgents[uaIndex % userAgents.length] ?? DEFAULT_USER_AGENTS[0];
      uaIndex++;
      const routed = gateway ? gateway(targetUrl) : { url: targetUrl };
      const requestHeaders = {
        ...browserHeaders(userAgent as string),
        ...extraHeaders,
        ...routed.headers,
      };

      try {
        const response = await fetchImpl(routed.url, {
          headers: requestHeaders,
          redirect: "follow",
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (response.ok || !RETRYABLE_STATUSES.has(response.status)) return response;
        lastResponse = response;
      } catch (error) {
        lastError = error;
      }

      if (attempt < retries) await sleep(delayFor(attempt, lastResponse));
    }

    if (lastResponse) return lastResponse;
    throw lastError ?? new Error(`Failed to fetch after ${retries + 1} attempts: ${targetUrl}`);
  };
}

/**
 * Builds a {@link Gateway} from a URL template. `{url}` is replaced with the
 * URL-encoded target and `{key}` with the API key. Works with managed scraping
 * APIs (which handle residential proxy rotation, JS rendering, and CAPTCHA),
 * e.g. `https://api.scraperapi.com/?api_key={key}&url={url}`.
 */
export function createGateway(config: { template: string; apiKey?: string }): Gateway {
  return (targetUrl) => ({
    url: config.template
      .replaceAll("{url}", encodeURIComponent(targetUrl))
      .replaceAll("{key}", config.apiKey ?? ""),
  });
}

export type CacheOptions = {
  /** Time-to-live in ms. */
  ttlMs: number;
  /** Max cached entries (oldest evicted). Default 200. */
  maxEntries?: number;
  /** Injectable clock (tests pass a controllable one). */
  now?: () => number;
};

type CacheEntry = { status: number; body: string; expires: number };

/**
 * Wraps a fetcher with a TTL cache of successful responses, keyed by URL. Keeps
 * listing data available during brief origin outages or rate-limit windows and
 * cuts request volume (which itself reduces the chance of being blocked).
 */
export function withCache(fetcher: FetchLike, options: CacheOptions): FetchLike {
  const { ttlMs, maxEntries = 200, now = Date.now } = options;
  const cache = new Map<string, CacheEntry>();

  const synth = (entry: CacheEntry): HttpResponse => ({
    ok: entry.status >= 200 && entry.status < 300,
    status: entry.status,
    headers: { get: () => null },
    text: async () => entry.body,
  });

  return async (url) => {
    const hit = cache.get(url);
    if (hit && hit.expires > now()) return synth(hit);
    if (hit) cache.delete(url);

    const response = await fetcher(url);
    if (response.ok) {
      const body = await response.text();
      if (cache.size >= maxEntries) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
      }
      cache.set(url, { status: response.status, body, expires: now() + ttlMs });
      return synth({ status: response.status, body, expires: 0 });
    }
    return response;
  };
}

const numberFromEnv = (value: string | undefined): number | undefined => {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

/**
 * Assembles the production fetcher from environment variables, so anti-blocking
 * infrastructure can be configured per-deployment without code changes:
 *
 * - `SCRAPER_GATEWAY_TEMPLATE` — proxy/scraping-API URL template (`{url}`, `{key}`)
 * - `SCRAPER_API_KEY` — API key substituted into the template
 * - `SCRAPER_TIMEOUT_MS`, `SCRAPER_RETRIES` — tuning
 * - `SCRAPER_CACHE_TTL_MS` — enables response caching when > 0
 */
export function createFetcherFromEnv(
  env: Record<string, string | undefined> = process.env,
): FetchLike {
  const template = env.SCRAPER_GATEWAY_TEMPLATE;
  const gateway = template ? createGateway({ template, apiKey: env.SCRAPER_API_KEY }) : undefined;

  const fetcher = createResilientFetcher({
    gateway,
    timeoutMs: numberFromEnv(env.SCRAPER_TIMEOUT_MS),
    retries: numberFromEnv(env.SCRAPER_RETRIES),
  });

  const ttlMs = numberFromEnv(env.SCRAPER_CACHE_TTL_MS) ?? 0;
  return ttlMs > 0 ? withCache(fetcher, { ttlMs }) : fetcher;
}
