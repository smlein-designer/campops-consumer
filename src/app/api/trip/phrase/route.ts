import { NextResponse } from "next/server";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { checkRateLimit, resolveClientKey } from "@/lib/rate-limit";
import { PhraseRequestSchema } from "@/lib/v3/intent-schema";

/**
 * Phrasing-only model call (Build Brief §8: "phrasing agent messages,
 * progress lines, and tradeoff explanations from facts the application
 * provides"). The model restates each already-true, already-computed fact
 * in the agent's voice — it never introduces a new fact, price, or status
 * not present in `facts`.
 */

const SYSTEM_PROMPT = `You rephrase CampOps' own factual statements into the agent's short, warm, plain-spoken voice.

Rules:
- Return exactly one rephrased line per input fact, same order, same count.
- Never add, remove, or change any number, name, date, time, or status in a fact — only its wording.
- Keep each line to one short sentence.
- Do not add extra commentary, greetings, or lines beyond the given facts.`;

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

  let body: { facts?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const facts = body.facts?.filter((f) => f.trim().length > 0) ?? [];
  if (facts.length === 0) {
    return NextResponse.json({ error: "facts is required." }, { status: 400 });
  }

  const client = new OpenAI({ apiKey });

  try {
    const response = await client.responses.parse({
      model: "gpt-5.4-mini",
      input: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify(facts) },
      ],
      text: { format: zodTextFormat(PhraseRequestSchema, "phrase_response") },
    });

    const parsed = response.output_parsed;
    if (!parsed || parsed.lines.length !== facts.length) {
      // Fall back to the deterministic facts verbatim rather than fail the turn.
      return NextResponse.json({ lines: facts });
    }
    return NextResponse.json({ lines: parsed.lines });
  } catch (err) {
    console.error("v3 phrasing failed, falling back to deterministic facts:", err);
    return NextResponse.json({ lines: facts });
  }
}
