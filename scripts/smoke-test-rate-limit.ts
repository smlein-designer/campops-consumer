/**
 * Regression coverage for Public Demo Rate Limiting (2026-09-08 — see
 * docs/implementation-decisions.md). CampOps is a public, unauthenticated
 * design POC; `/api/intent` is the one expensive (OpenAI-calling) route,
 * protected by a per-IP sliding-window limit via Upstash Redis.
 *
 * WHAT IS AND ISN'T INTEGRATION-TESTED (be explicit, per the standing
 * instruction):
 * - `resolveClientKey` is tested directly against real `Headers` objects —
 *   full, real coverage, no mocking involved.
 * - The "Upstash not configured" path is tested against `checkRateLimit`'s
 *   REAL module-level singleton, in THIS environment, where
 *   UPSTASH_REDIS_REST_URL/TOKEN are genuinely unset — this is real
 *   integration coverage of that path (not mocked), proving the module
 *   loads and behaves correctly with no Upstash config present at all.
 * - The "under limit", "over limit", and "Upstash throws" paths are tested
 *   via `checkRateLimit`'s `limiterOverride` parameter — a minimal,
 *   deliberate dependency-injection seam (NOT a mocking library, NOT a
 *   real Upstash connection) that lets a fake limiter stand in for the
 *   real one. This proves `checkRateLimit`'s OWN logic (interpreting a
 *   limiter's result, failing open on a thrown error) is correct; it does
 *   NOT prove Upstash's own sliding-window algorithm works, or that real
 *   network credentials/latency behave as expected. That must be verified
 *   manually against the deployed Vercel URL with real Upstash credentials
 *   configured — this script does not and cannot substitute for that.
 * - The route's actual before-OpenAI ordering, the 429 response shape, and
 *   the client's 429 handling are verified by direct source inspection
 *   below (the same static-guard pattern already used elsewhere in this
 *   project for wiring invariants that don't need a browser) plus manual
 *   live verification (see docs/implementation-decisions.md).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checkRateLimit, resolveClientKey } from "../src/lib/rate-limit";

let failures = 0;
function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`PASS: ${message}`);
  } else {
    failures++;
    console.error(`FAIL: ${message}`);
  }
}
function run(label: string, fn: () => void) {
  console.log(`\n=== ${label} ===`);
  fn();
}

async function main() {
  // --- resolveClientKey (real, unmocked) ---

  run("resolveClientKey uses the first address in x-forwarded-for", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" });
    assert(resolveClientKey(headers) === "203.0.113.7", "the first (original client) address is used, not a later proxy hop");
  });

  run("resolveClientKey trims whitespace around the first address", () => {
    const headers = new Headers({ "x-forwarded-for": "  203.0.113.7 , 10.0.0.1" });
    assert(resolveClientKey(headers) === "203.0.113.7", "whitespace around the address is trimmed");
  });

  run("resolveClientKey falls back to a stable 'unknown' key, never throws, when the header is absent", () => {
    const headers = new Headers();
    assert(resolveClientKey(headers) === "unknown", "no x-forwarded-for header -> 'unknown', not a crash");
  });

  run("resolveClientKey never derives identity from request body content", () => {
    // Structural guard: the function signature itself only accepts Headers,
    // not a body/message — this is enforced by the type system, asserted
    // here as documentation of the invariant rather than a runtime check.
    assert(resolveClientKey.length === 1, "resolveClientKey takes only Headers — no way to pass body/message content into it");
  });

  // --- checkRateLimit: real "not configured" path (this environment has no Upstash env vars) ---

  console.log("\n=== With no Upstash env vars configured (this environment), checkRateLimit allows and never throws ===");
  {
    const result = await checkRateLimit("test-key-no-config");
    assert(result.allowed === true, "an unconfigured limiter must allow the request (fail open, local dev)");
  }

  // --- checkRateLimit: dependency-injected fake limiter (the DI seam, not a mocking library) ---

  console.log("\n=== A request under the limit is allowed ===");
  {
    const fakeLimiter = {
      limit: async () => ({ success: true, limit: 10, remaining: 4, reset: Date.now() + 60_000 }),
    };
    const result = await checkRateLimit("ip-under-limit", fakeLimiter);
    assert(result.allowed === true, "success:true from the limiter must be reported as allowed");
    assert(result.remaining === 4, "remaining count is passed through");
  }

  console.log("\n=== A request over the limit is denied ===");
  {
    const fakeLimiter = {
      limit: async () => ({ success: false, limit: 10, remaining: 0, reset: Date.now() + 60_000 }),
    };
    const result = await checkRateLimit("ip-over-limit", fakeLimiter);
    assert(result.allowed === false, "success:false from the limiter must be reported as NOT allowed");
  }

  console.log("\n=== Upstash throwing (simulated outage) fails OPEN, never crashes ===");
  {
    const fakeLimiter = {
      limit: async (): Promise<never> => {
        throw new Error("simulated Upstash outage");
      },
    };
    let threw = false;
    let result;
    try {
      result = await checkRateLimit("ip-during-outage", fakeLimiter);
    } catch {
      threw = true;
    }
    assert(!threw, "checkRateLimit must never throw, even when the underlying limiter does");
    assert(!!result && result.allowed === true, "an Upstash failure must fail OPEN (allowed), per the standing rule for this demo");
  }

  console.log("\n=== A denied result never leaks limiter internals as a thrown error or exception payload ===");
  {
    const fakeLimiter = {
      limit: async () => ({ success: false, limit: 10, remaining: 0, reset: 123456 }),
    };
    const result = await checkRateLimit("ip-check-shape", fakeLimiter);
    const keys = Object.keys(result).sort();
    assert(
      JSON.stringify(keys) === JSON.stringify(["allowed", "limit", "remaining", "reset"]),
      `result shape must be exactly the documented fields, nothing else — got ${JSON.stringify(keys)}`,
    );
  }

  // --- Route wiring: static source guards (no browser needed for these invariants) ---

  const routeSource = readFileSync(
    join(__dirname, "..", "src", "app", "api", "intent", "route.ts"),
    "utf-8",
  );

  run("The route checks the rate limit BEFORE the OpenAI client is constructed", () => {
    const rateLimitIdx = routeSource.indexOf("checkRateLimit(");
    const openAiIdx = routeSource.indexOf("new OpenAI(");
    assert(rateLimitIdx !== -1 && openAiIdx !== -1, "both calls must exist in the route");
    assert(rateLimitIdx < openAiIdx, "checkRateLimit must run before the OpenAI client is ever constructed");
  });

  run("An over-limit request returns HTTP 429 with the documented compact error shape", () => {
    assert(/status:\s*429/.test(routeSource), "the route must return status 429 on a denied result");
    assert(
      /Too many requests\. Please wait a moment and try again\./.test(routeSource),
      "the documented compact error message must be present",
    );
  });

  run("No Upstash secret values are ever included in a response body", () => {
    const jsonCallIdx = routeSource.indexOf("NextResponse.json");
    assert(
      !/UPSTASH_REDIS_REST_TOKEN/.test(routeSource.slice(jsonCallIdx, jsonCallIdx + 2000)),
      "the token env var name must never appear near a response construction",
    );
  });

  // --- Client (page.tsx) 429 handling: static source guard ---

  const pageSource = readFileSync(join(__dirname, "..", "src", "app", "page.tsx"), "utf-8");

  run("The client checks for status 429 before the generic error path, and does not throw for it", () => {
    const rateLimitCheckIdx = pageSource.indexOf("res.status === 429");
    const genericThrowIdx = pageSource.indexOf("throw new Error(data.error");
    assert(rateLimitCheckIdx !== -1, "page.tsx must check for a 429 response");
    assert(genericThrowIdx !== -1, "the generic error throw must still exist for other failures");
    assert(rateLimitCheckIdx < genericThrowIdx, "the 429 check must run BEFORE the generic error throw");
  });

  run("The 429 handler does not reset any task state (no setIntent(EMPTY_TRIP_INTENT), no setMessages([]))", () => {
    const idx = pageSource.indexOf("res.status === 429");
    const section = pageSource.slice(idx, idx + 400);
    assert(!/setMessages\(\[\]\)/.test(section), "the 429 branch must not clear messages");
    assert(!/setIntent\(EMPTY_TRIP_INTENT\)/.test(section), "the 429 branch must not reset TripIntent");
    assert(/pushChat/.test(section), "the 429 branch should still give the user a concise chat acknowledgment");
  });

  if (failures > 0) {
    console.error(`\n${failures} rate-limit check(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll rate-limit checks passed.");
}

main().catch((e) => {
  console.error("SCRIPT_FAILED", e);
  process.exit(1);
});
