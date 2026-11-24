import { NextResponse } from "next/server";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { checkRateLimit, resolveClientKey } from "@/lib/rate-limit";
import { V3IntentExtractionSchema } from "@/lib/v3/intent-schema";
import type { V3TripIntent } from "@/lib/v3/schemas";

/**
 * Structured intent interpretation for the v3 Trip flow (Build Brief
 * §7-§9/§14): the model turns a message into structured trip facts and
 * requirements plus an actionable/needs_clarification/unsupported judgment.
 * It never decides search, availability, or holds — the application
 * validates and applies this output deterministically
 * (src/lib/v3/agent-loop.ts).
 */

const SYSTEM_PROMPT = `You are the intent-interpretation layer for CampOps, a camping-trip planning assistant.

Read the user's new message together with what the trip already knows, and return ONLY what this message adds or
changes, plus a status. The application merges your output into the trip; a null field means "this message did not
say", so the existing value is kept.

A camping trip is a campsite, and optionally things offered near it: a boat or pontoon rental, a horseback trail
ride, a guided hike, kayaks, or small campground add-ons. Many trips are just a campsite. Never add an activity the
user did not ask for.

Trip facts (set a field only when this message states it):
- checkIn / checkOut: exact dates only, written like "Apr 16". "Apr 16 to 18" is checkIn "Apr 16", checkOut "Apr 18".
- dateHint: a loose timeframe with no exact dates ("sometime in April", "next month", "this summer"). When you set
  dateHint, leave checkIn and checkOut null. Do not ask a clarifying question about dates — the application does.
- adults / children / pets: only from explicit statements ("4 of us", "two kids", "our dog"). "4 adults and 2 kids"
  is adults 4, children 2. "6 people" is adults 6.
- destination: a named place they want to camp IN ("Hill Country", "Big Bend", "near Fredericksburg"). A kind of
  trip is never a destination: "a lake weekend", "a beach trip", "somewhere quiet" name no place — leave
  destination null and put "Lake", "Beach" or "Quiet" in requirements instead.
- origin: where they start FROM. In "under 2 hours from Austin", origin is "Austin" and driveLimitHours is 2 —
  Austin is NOT the destination. A ZIP they give as their own is also origin. Never guess one.
- budgetTotalUsd: a limit for the whole trip ("budget $800", "keep it under $500 all in").
  budgetPerNightUsd: a nightly campsite limit ("under $90 a night"). Fill only the one they meant.

Requirements: everything else they want — "On the water", "Quiet", "Showers", "Stargazing", "Tent site",
"Boat rental", "Beginner trail ride", "Guided hike", "Kayaks". Keep each label short. Do not repeat a trip fact
(dates, party, pets, destination, drive time, budget) as a requirement.
- "must" for needs and dealbreakers. "nice" for wishes ("would love", "maybe", "if possible").
- Activities are "nice" by default, so a good campsite is not dropped because one activity is missing. Use "must"
  for an activity only when the user says it is essential.
- To change an existing requirement's importance, return it again with the new tier.

Status:
- "actionable": anything CampOps can work with, even a single preference.
- "needs_clarification": the message gives nothing to act on, or is truly ambiguous in a way that changes the
  result. Ask one short question. Never ask about dates, party size or starting point — the application asks for
  those itself. Give 2-4 clarificationOptions only when the answers are naturally a short list.
- "unsupported": outside camping-trip planning (flights, hotels, rental cars, restaurants, unrelated chat). Say
  briefly what is out of scope and what CampOps does cover. Leave every trip field null.

candidateQuestion: only when the application says a campsite is currently shown or held AND the message asks to be
TOLD a fact about that site ("is it near water?", "does it have showers?", "how far is it?"). Then leave every trip
field null. A request to change the trip ("make sure it has showers") is not a question.`;

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

  let body: { message?: string; intent?: V3TripIntent; hasCampsite?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const message = body.message?.trim();
  if (!message) {
    return NextResponse.json({ error: "message is required." }, { status: 400 });
  }
  const known = body.intent
    ? { ...body.intent, requirements: body.intent.requirements.map((r) => ({ label: r.label, tier: r.tier })) }
    : {};

  const client = new OpenAI({ apiKey });

  try {
    const response = await client.responses.parse({
      model: "gpt-5.4-mini",
      input: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `What the trip already knows:\n${JSON.stringify(known)}\n\n${body.hasCampsite ? "A campsite IS currently shown or held." : "No campsite is shown yet."}\n\nNew user message:\n"${message}"`,
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
