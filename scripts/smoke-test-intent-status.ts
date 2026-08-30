/**
 * Live verification of the intent-interpretation status classification
 * against the real GPT-5.4 mini endpoint. Requires the dev server running
 * (npm run dev) and OPENAI_API_KEY configured — this exercises the actual
 * model, not just the deterministic app logic, since the classification
 * itself is a model judgment call this project deliberately does not
 * second-guess by counting TripIntent fields.
 *
 * Skips gracefully (exit 0) if the server isn't reachable, so it doesn't
 * fail the rest of the regression suite in environments without a live key.
 */
const BASE = "http://localhost:3000/api/intent";

let failures = 0;
function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`PASS: ${message}`);
  } else {
    failures++;
    console.error(`FAIL: ${message}`);
  }
}

async function call(message: string, priorIntent?: unknown) {
  const res = await fetch(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, priorIntent }),
  });
  const json = await res.json();
  return { status: res.status, json };
}

async function main() {
  // Reachability / key check.
  const probe = await fetch(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "ping" }),
  }).catch(() => null);
  if (!probe) {
    console.log(
      "SKIP: dev server not reachable at localhost:3000 — start it with `npm run dev` to run this test.",
    );
    return;
  }
  if (probe.status === 500) {
    const body = await probe.json().catch(() => ({}));
    if (String(body.error ?? "").includes("OPENAI_API_KEY")) {
      console.log(
        "SKIP: OPENAI_API_KEY not configured — cannot verify live status classification.",
      );
      return;
    }
  }

  // 1. Vague but in-domain request -> needs_clarification.
  {
    const r = await call("We want to go camping soon.");
    console.log(
      "\n[vague] ->",
      JSON.stringify(r.json.interpretation?.status),
      r.json.interpretation?.clarification,
    );
    assert(r.status === 200, "vague request: 200 response");
    assert(
      r.json.interpretation?.status === "needs_clarification",
      `vague in-domain request should be needs_clarification — got "${r.json.interpretation?.status}"`,
    );
    assert(
      !!r.json.interpretation?.clarification?.question,
      "clarification.question is present",
    );
  }

  // 2 & 3. Clarification answer merges with existing intent; already-known
  // fields survive.
  {
    const turnA = await call(
      "A 4-person, pet-friendly trip. Not sure about dates yet.",
    );
    console.log("\n[turnA] ->", JSON.stringify(turnA.json.interpretation));
    const intentA = turnA.json.interpretation?.intent;
    assert(intentA?.guestCount === 4, "turn A: guestCount captured");
    assert(
      Array.isArray(intentA?.hardRequirements) &&
        intentA.hardRequirements.some((h: string) => /pet/i.test(h)),
      "turn A: pet-friendly captured as a hard requirement",
    );

    const turnB = await call("Let's do Sept 20 to 22.", intentA);
    console.log("\n[turnB] ->", JSON.stringify(turnB.json.interpretation));
    const intentB = turnB.json.interpretation?.intent;
    assert(
      intentB?.guestCount === 4,
      "already-known guestCount survives the clarification answer",
    );
    assert(
      Array.isArray(intentB?.hardRequirements) &&
        intentB.hardRequirements.some((h: string) => /pet/i.test(h)),
      "already-known pet-friendly requirement survives the clarification answer",
    );
    assert(
      turnB.json.interpretation?.status === "actionable",
      `turn B (dates now supplied) should become actionable — got "${turnB.json.interpretation?.status}"`,
    );
  }

  // 4. Unsupported request -> unsupported, not needs_clarification.
  {
    const r = await call(
      "Can you also book my flights and rental car for this trip?",
    );
    console.log(
      "\n[unsupported] ->",
      JSON.stringify(r.json.interpretation?.status),
      r.json.interpretation?.unsupported,
    );
    assert(
      r.json.interpretation?.status === "unsupported",
      `flights/rental-car request should be unsupported — got "${r.json.interpretation?.status}"`,
    );
    assert(
      !!r.json.interpretation?.unsupported?.reason,
      "unsupported.reason is present",
    );
  }

  // 5. Unsupported turn does not erase an existing active trip (model-level
  // check — the app additionally enforces this deterministically regardless).
  {
    const established = await call(
      "A 4-person, pet-friendly trip near water, Sept 12 to 14.",
    );
    const priorIntent = established.json.interpretation?.intent;
    assert(
      priorIntent?.guestCount === 4,
      "setup: established trip has guestCount 4",
    );

    const unsupportedTurn = await call(
      "Can you also book my flights?",
      priorIntent,
    );
    console.log(
      "\n[unsupported w/ prior intent] ->",
      JSON.stringify(unsupportedTurn.json.interpretation),
    );
    assert(
      unsupportedTurn.json.interpretation?.status === "unsupported",
      `follow-up flights request should be unsupported — got "${unsupportedTurn.json.interpretation?.status}"`,
    );
    assert(
      unsupportedTurn.json.interpretation?.intent?.guestCount === 4,
      "model itself still echoes the established guestCount on an unsupported turn (defense in depth — the app also ignores this field entirely on unsupported turns)",
    );
  }

  if (failures > 0) {
    console.error(`\n${failures} intent-status check(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll intent-status checks passed.");
}

main().catch((e) => {
  console.error("SCRIPT_FAILED", e);
  process.exit(1);
});
