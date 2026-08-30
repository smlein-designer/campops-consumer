import { NextResponse } from "next/server";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import {
  EMPTY_TRIP_INTENT,
  TripIntentSchema,
  type TripIntent,
} from "@/lib/schemas";

/**
 * Structured intent extraction (Build Brief §7/§11/§12): GPT-5.4 mini
 * interprets natural language into a TripIntent; the model never mutates
 * application state directly — its output is validated against
 * TripIntentSchema before the caller applies it.
 */

const SYSTEM_PROMPT = `You are the intent-interpretation layer for CampOps, a camping-trip booking assistant.

Your only job is to read the user's message and the trip's current understood intent, then return an
updated, structured TripIntent capturing what they want.

Rules:
- CampOps' domain is camping/campsite trip planning only. Do not invent campsite inventory, prices, or
  availability — those are not your responsibility.
- Distinguish hard requirements (non-negotiable), flexible constraints (could shift under a tradeoff),
  preferences (nice-to-have), and priorities (relative tradeoffs, e.g. "willing to drive farther for more
  seclusion") only when the user's message gives you enough evidence to do so.
- Preserve everything already established in the current intent unless the user's new message changes it.
  Merge, don't discard.
- Keep every requirement/preference/priority as a short, plain-language label (a few words), not a sentence.
- goalStatement should be one plain sentence restating the user's overall trip goal.
- If the user gives no new information relevant to a field, keep the current value.`;

export async function POST(req: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not configured on the server." },
      { status: 500 },
    );
  }

  let body: { message?: string; priorIntent?: TripIntent };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const message = body.message?.trim();
  if (!message) {
    return NextResponse.json(
      { error: "message is required." },
      { status: 400 },
    );
  }
  const priorIntent = body.priorIntent ?? EMPTY_TRIP_INTENT;

  const client = new OpenAI({ apiKey });

  try {
    const response = await client.responses.parse({
      model: "gpt-5.4-mini",
      input: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Current understood intent:\n${JSON.stringify(priorIntent, null, 2)}\n\nNew user message:\n"${message}"`,
        },
      ],
      text: {
        format: zodTextFormat(TripIntentSchema, "trip_intent"),
      },
    });

    const parsed = response.output_parsed;
    if (!parsed) {
      return NextResponse.json(
        { error: "Model did not return a parsable structured response." },
        { status: 502 },
      );
    }

    // Re-validate before handing back to the caller — never trust model
    // output as application state without validation (Build Brief §7).
    const intent = TripIntentSchema.parse(parsed);
    return NextResponse.json({ intent });
  } catch (err) {
    console.error("Intent extraction failed:", err);
    return NextResponse.json(
      {
        error: "Intent extraction failed.",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }
}
