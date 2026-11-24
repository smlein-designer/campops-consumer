import { z } from "zod";

/**
 * Structured intent extraction for the v3 Trip flow (Build Brief §7-§9).
 * v3 distinguishes must-haves from nice-to-haves (PRD v3 §5.1); the trip
 * facts v2 already understood (destination, origin, budget, children) are
 * all still here.
 */
export const V3RequirementExtractionSchema = z.object({
  label: z.string().describe("Short plain-language requirement, e.g. 'On the water' or 'Quiet'."),
  tier: z.enum(["must", "nice"]).describe("Non-negotiable (must) vs nice-to-have (nice)."),
});

export const V3IntentExtractionSchema = z.object({
  checkIn: z.string().nullable().describe("Check-in date if an exact date was stated, as 'Apr 16', else null."),
  checkOut: z.string().nullable().describe("Check-out date if an exact date was stated, as 'Apr 18', else null."),
  dateHint: z
    .string()
    .nullable()
    .describe("A loose timeframe when no exact dates were given, e.g. 'April', 'sometime in May', 'this summer'. Null otherwise."),
  adults: z.number().int().nullable().describe("Number of adults, or null if not stated."),
  children: z.number().int().nullable().describe("Number of children explicitly mentioned as coming, or null."),
  pets: z.number().int().nullable().describe("Number of pets/dogs actually coming, or null if none mentioned."),
  destination: z
    .string()
    .nullable()
    .describe("The place or region they want to camp IN, e.g. 'Hill Country', 'Big Bend'. Null if none named."),
  origin: z
    .string()
    .nullable()
    .describe("Where they are starting FROM: their own ZIP or city, e.g. 'Austin' in 'under 2 hours from Austin'. Null if not stated."),
  driveLimitHours: z.number().nullable().describe("Maximum drive time in hours, if stated."),
  budgetTotalUsd: z.number().nullable().describe("Spending limit for the whole trip, if stated."),
  budgetPerNightUsd: z.number().nullable().describe("Campsite nightly-rate limit, if stated."),
  requirements: z
    .array(V3RequirementExtractionSchema)
    .describe("Every other requirement or preference mentioned in THIS message, each tagged must or nice."),
  status: z.enum(["actionable", "needs_clarification", "unsupported"]),
  clarificationQuestion: z
    .string()
    .nullable()
    .describe('Present only when status is "needs_clarification": one clear question.'),
  clarificationOptions: z
    .array(z.string())
    .nullable()
    .describe('With a clarificationQuestion whose answers are naturally a short list: 2 to 4 short option labels. Null otherwise.'),
  unsupportedReason: z
    .string()
    .nullable()
    .describe('Present only when status is "unsupported": one or two calm sentences.'),
  candidateQuestion: z
    .object({
      topic: z.enum([
        "pet",
        "water",
        "family",
        "noise",
        "seclusion",
        "distance",
        "amenity",
        "capacity",
        "price",
        "availability",
        "site_type",
        "other",
      ]),
      amenityHint: z.string().nullable(),
    })
    .nullable()
    .describe("Only when a campsite is currently shown or held AND the message asks to be told a fact about that site ('is it near water?'). Null for anything that changes the trip."),
});

export type V3IntentExtraction = z.infer<typeof V3IntentExtractionSchema>;

export const PhraseRequestSchema = z.object({
  lines: z.array(z.string()).describe("A natural, friendly rephrasing of each input fact, in the same order, same length."),
});

export type PhraseResponse = z.infer<typeof PhraseRequestSchema>;
