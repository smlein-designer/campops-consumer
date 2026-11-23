import { NextResponse } from "next/server";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { checkRateLimit, resolveClientKey } from "@/lib/rate-limit";
import { V3IntentExtractionSchema } from "@/lib/v3/intent-schema";
import type { TripRequirement } from "@/lib/v3/schemas";

/**
 * Structured intent interpretation for the v3 Trip flow (Build Brief
 * §7-§9/§14): the model turns a message into structured must-haves/
 * nice-to-haves plus an actionable/needs_clarification/unsupported
 * judgment. It never decides search, availability, or holds — the
 * application validates and applies this output deterministically
 * (src/lib/v3/agent-loop.ts).
 */

const SYSTEM_PROMPT = `You are the intent-interpretation layer for CampOps, a camping-trip booking assistant.

Read the user's message and the trip's currently established requirements, then return the updated structured
requirements plus a status.

- CampOps only covers one campsite plus nearby activities (boating, horseback trail rides, guided hikes, kayaking)
  and campground add-ons for a single trip near Austin, Texas. It does not cover flights, hotels, rental cars, or
  anything outside camping-trip planning.
- Classify each requirement as "must" (non-negotiable) or "nice" (a preference). Keep each label short and
  plain (a few words), e.g. "Waterfront", "Dogs OK", "Budget $90/night", "Trail ride", "Guided hike", "Kayaking".
- Merge with the already-established requirements; do not discard anything the user hasn't contradicted.
- adults/pets: only from explicit statements ("4 of us", "my dog"). Leave null if not stated. A trip already in
  progress keeps its prior adults/pets unless the user changes them.
- checkIn/checkOut: only if explicitly stated (e.g. "Apr 16 to 18"). Leave null if not stated or already known.
- originZip: ONLY if the user states their own ZIP code explicitly. Never guess.
- driveLimitHours/budgetUsd: only from explicit statements ("within 2 hours", "under $90 a night").
- status "actionable": enough is known to search (even a single clear preference is enough to start).
- status "needs_clarification": the message gives essentially nothing to act on. Ask one short, specific question.
  If the question has a short, natural set of discrete answers (e.g. a choice between two date ranges), also give
  2-4 short clarificationOptions the user could tap instead of typing; otherwise leave clarificationOptions null.
- status "unsupported": the request is for something outside CampOps' scope (flights, hotels, rental cars,
  unrelated chit-chat). Say briefly what's out of scope and that CampOps can continue with the camping request.
Only one of clarificationQuestion/unsupportedReason is non-null, matching status.`;

export async function POST(req: Request) {
  const clientKey = resolveClientKey(req.headers);
  const rateLimitResult = await checkRateLimit(clientKey);
  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a moment and try again." },
      { status: 429 },
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY is not configured on the server." }, { status: 500 });
  }

  let body: { message?: string; priorRequirements?: TripRequirement[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const message = body.message?.trim();
  if (!message) {
    return NextResponse.json({ error: "message is required." }, { status: 400 });
  }
  const priorRequirements = body.priorRequirements ?? [];

  const client = new OpenAI({ apiKey });

  try {
    const response = await client.responses.parse({
      model: "gpt-5.4-mini",
      input: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Already-established requirements:\n${JSON.stringify(priorRequirements.map((r) => ({ label: r.label, tier: r.tier })))}\n\nNew user message:\n"${message}"`,
        },
      ],
      text: { format: zodTextFormat(V3IntentExtractionSchema, "intent_extraction") },
    });

    const parsed = response.output_parsed;
    if (!parsed) {
      return NextResponse.json({ error: "Model did not return a parsable structured response." }, { status: 502 });
    }
    const extraction = V3IntentExtractionSchema.parse(parsed);
    return NextResponse.json({ extraction });
  } catch (err) {
    console.error("v3 intent interpretation failed:", err);
    return NextResponse.json(
      { error: "Intent interpretation failed.", detail: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
