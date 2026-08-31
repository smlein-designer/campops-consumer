import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/**
 * Public Demo Rate Limiting (2026-09-08 — see docs/implementation-decisions.md).
 * CampOps is a public, unauthenticated design POC on Vercel Hobby; the one
 * expensive route is `/api/intent` (calls OpenAI). This is intentionally
 * small and single-purpose — a per-IP sliding-window limit to stop one
 * IP/bot from burning API credits, NOT a generic middleware framework, not
 * auth, not per-user quotas.
 *
 * Server-only: this module reads `UPSTASH_REDIS_REST_URL`/
 * `UPSTASH_REDIS_REST_TOKEN` (never `NEXT_PUBLIC_*` — those are bundled
 * into client JS) and is only ever imported from a route handler.
 *
 * Local development: if either env var is missing, rate limiting is
 * silently disabled (one clear warning logged once) rather than crashing
 * — this project has no fake/dummy Redis credentials to fall back to, and
 * a demo POC must stay trivially runnable with just `OPENAI_API_KEY` set.
 * In production, if both vars ARE configured (see Vercel deployment notes
 * in docs/implementation-decisions.md), the limiter is active.
 *
 * Fail-open on infrastructure failure (deliberate for this demo, per the
 * standing rule "rate-limit infrastructure failure should fail open... this
 * demo rather than take the whole POC down"): if Upstash itself is
 * unreachable, `checkRateLimit` logs the error and reports the request as
 * allowed — a transient Upstash outage must never make the whole POC
 * unusable. This is the ONE fail-open exception; an actual over-limit
 * result (Upstash reachable, limit genuinely exceeded) still fails closed
 * with a 429, handled by the route.
 */

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

let warnedMissingConfig = false;

function warnOnceIfMissingConfig() {
  if (warnedMissingConfig) return;
  warnedMissingConfig = true;
  console.warn(
    "[rate-limit] UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN not set — rate limiting is disabled. " +
      "This is expected in local development; set both in Vercel for production.",
  );
}

// Constructed once per server instance, only when configured — never a
// fake/placeholder client that would silently no-op every call.
const limiter: Ratelimit | null =
  REDIS_URL && REDIS_TOKEN
    ? new Ratelimit({
        redis: new Redis({ url: REDIS_URL, token: REDIS_TOKEN }),
        // ~10 requests/minute/IP — intentionally conservative for a public
        // portfolio/demo app, not a production API tier.
        limiter: Ratelimit.slidingWindow(10, "1 m"),
        prefix: "campops:intent",
      })
    : null;

if (!limiter) warnOnceIfMissingConfig();

/**
 * Derives a stable per-client key from the standard Vercel/proxy forwarded
 * header — the first address in `x-forwarded-for` (the original client,
 * per the standard convention; later entries are intermediate proxies).
 * Deliberately NOT derived from anything in the request body — identity
 * for rate-limiting must never depend on trusting model/user-supplied
 * input. Falls back to a stable "unknown" bucket (shared across all
 * IP-less requests) rather than throwing, so a locally-proxied or
 * malformed request never crashes the route.
 */
export function resolveClientKey(headers: Headers): string {
  const forwardedFor = headers.get("x-forwarded-for");
  const firstIp = forwardedFor?.split(",")[0]?.trim();
  return firstIp || "unknown";
}

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  reset: number;
};

/** The minimal shape `checkRateLimit` actually needs from a limiter — just
 * enough to allow a fake one to be injected in tests without a mocking
 * library or real Upstash credentials (see scripts/smoke-test-rate-limit.ts). */
type LimiterLike = { limit: (key: string) => Promise<{ success: boolean; limit: number; remaining: number; reset: number }> };

/**
 * The one check the route needs. Returns `allowed: true` (with permissive
 * placeholder numbers) whenever the limiter isn't configured OR Upstash is
 * unreachable — both are "don't block the demo" cases, distinct from a
 * genuine over-limit result, which is the only case that returns
 * `allowed: false`.
 *
 * `limiterOverride` is test-only dependency injection — omitted (the
 * normal, production call shape), it uses the real module-level Upstash
 * limiter (or `null` if unconfigured) exactly as before.
 */
export async function checkRateLimit(
  key: string,
  limiterOverride?: LimiterLike | null,
): Promise<RateLimitResult> {
  const activeLimiter = limiterOverride !== undefined ? limiterOverride : limiter;
  if (!activeLimiter) {
    return { allowed: true, limit: 0, remaining: 0, reset: 0 };
  }
  try {
    const result = await activeLimiter.limit(key);
    return {
      allowed: result.success,
      limit: result.limit,
      remaining: result.remaining,
      reset: result.reset,
    };
  } catch (err) {
    // Fail open: an Upstash outage must not take the whole POC down.
    // Logged server-side only — never surfaced to the client.
    console.error("[rate-limit] Upstash check failed, failing open:", err);
    return { allowed: true, limit: 0, remaining: 0, reset: 0 };
  }
}
