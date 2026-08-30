import { NextResponse } from "next/server";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import {
  EMPTY_TRIP_INTENT,
  IntentInterpretationSchema,
  type TripIntent,
} from "@/lib/schemas";

/**
 * Structured intent interpretation (Build Brief §7/§11/§12): GPT-5.4 mini
 * interprets natural language into an IntentInterpretation — a TripIntent
 * plus an explicit actionable/needs_clarification/unsupported judgment.
 * The model never mutates application state directly — its output is
 * validated against IntentInterpretationSchema before the caller applies it.
 */

const SYSTEM_PROMPT = `You are the intent-interpretation layer for CampOps, a camping-trip booking assistant.

Your job is to read the user's message and the trip's current understood intent, then return an updated,
structured TripIntent capturing what they want, PLUS an explicit status classifying whether CampOps can
usefully act on this turn.

Extracting TripIntent:
- CampOps' domain is camping/campsite trip planning only. Do not invent campsite inventory, prices, or
  availability — those are not your responsibility.
- Distinguish hard requirements (non-negotiable), flexible constraints (could shift under a tradeoff),
  preferences (nice-to-have), and priorities (relative tradeoffs) only when the user's message gives you
  enough evidence to do so.
- Priorities require explicit or strongly supported relative tradeoff language — the user clearly stating
  what should win over what (e.g. "willing to drive farther for more seclusion", "price matters more than
  distance"). Qualitative descriptors alone (e.g. "peaceful", "off the beaten path", "somewhere we can
  unplug") are Preferences, not Priorities, unless the user actually states which side of a tradeoff wins.
  Do not infer a tradeoff the user did not state.
- Preserve everything already established in the current intent unless the user's new message changes it.
  Merge, don't discard.
- Keep every requirement/preference/priority as a short, plain-language label (a few words), not a sentence.
- goalStatement should be one plain sentence restating the user's overall trip goal.
- If the user gives no new information relevant to a field, keep the current value.
- Always return your best current merged understanding of TripIntent regardless of status below — even
  when clarification is needed or the request is unsupported, still reflect whatever camping-relevant
  information is genuinely known so far.

Classifying status — this is a real judgment, not a byproduct of how many TripIntent fields are filled in:

"actionable" — CampOps has enough to search and evaluate responsibly. This does not require every field
to be filled in; a request built entirely from preferences, or one with just dates and a headcount, can
still be actionable if there's enough to reason about.

"needs_clarification" — the request is a legitimate, in-domain camping request, but is missing information
CampOps cannot safely guess without a materially wrong assumption (e.g. the message gives essentially
nothing to search on at all, or a specific ambiguity would meaningfully change the result either way).
Do NOT ask about anything already present in the current understood intent (check it before asking) — only
ask when the answer materially changes what CampOps would do next. When you use this status, fill in
the clarification field with one clear, specific question, and, only when the answer space is naturally a short
list of options, 2-4 short quickReplies (otherwise leave quickReplies empty — the composer is always
available). Never expose confidence scores or your private reasoning — only the question itself.

"unsupported" — the user is asking CampOps to do something outside this POC's supported scope entirely
(e.g. booking flights, hotels, or rental cars; general chit-chat unrelated to camping; modifying or
cancelling a real existing reservation; anything involving real payment processing). This is about the
TASK being out of scope, not about the camping request being hard to satisfy — an in-domain camping
request with no good match is never "unsupported". When you use this status, fill in the unsupported
reason field with one or two calm, plain sentences stating what's outside CampOps' scope, and if there's a clear
camping-relevant part of the request that's still workable, mention that CampOps can continue with that.

Only one of "clarification" or "unsupported" should be non-null, matching the status. Both are null when
status is "actionable".`;

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
        format: zodTextFormat(
          IntentInterpretationSchema,
          "intent_interpretation",
        ),
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
    const interpretation = IntentInterpretationSchema.parse(parsed);
    return NextResponse.json({ interpretation });
  } catch (err) {
    console.error("Intent interpretation failed:", err);
    return NextResponse.json(
      {
        error: "Intent interpretation failed.",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }
}
