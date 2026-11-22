import { z } from "zod";

/**
 * Structured intent extraction for the v3 Trip flow (Build Brief §7-§9).
 * Simpler than v2's four-tier TripIntentSchema: v3 only distinguishes
 * must-haves from nice-to-haves (Handoff Spec §7 "Trip intent").
 */
export const V3RequirementExtractionSchema = z.object({
  label: z.string().describe("Short plain-language requirement, e.g. 'Waterfront' or 'Dogs OK'."),
  tier: z.enum(["must", "nice"]).describe("Non-negotiable (must) vs nice-to-have (nice)."),
});

export const V3IntentExtractionSchema = z.object({
  checkIn: z.string().nullable().describe("Check-in date if stated (e.g. 'Apr 16'), else null."),
  checkOut: z.string().nullable().describe("Check-out date if stated, else null."),
  adults: z.number().int().nullable().describe("Number of adults, or null if not stated."),
  pets: z.number().int().nullable().describe("Number of pets/dogs coming, or null/0 if none."),
  originZip: z
    .string()
    .nullable()
    .describe("The user's own starting ZIP, ONLY if explicitly stated — never guessed."),
  driveLimitHours: z.number().nullable().describe("Maximum drive time in hours, if stated."),
  budgetUsd: z.number().nullable().describe("Maximum nightly campsite budget in dollars, if stated."),
  requirements: z
    .array(V3RequirementExtractionSchema)
    .describe("Every requirement/preference mentioned, each tagged must or nice. Merge with, don't discard, anything already established."),
  status: z.enum(["actionable", "needs_clarification", "unsupported"]),
  clarificationQuestion: z
    .string()
    .nullable()
    .describe('Present only when status is "needs_clarification": one clear question.'),
  unsupportedReason: z
    .string()
    .nullable()
    .describe('Present only when status is "unsupported": one or two calm sentences.'),
});

export type V3IntentExtraction = z.infer<typeof V3IntentExtractionSchema>;

export const PhraseRequestSchema = z.object({
  lines: z.array(z.string()).describe("A natural, friendly rephrasing of each input fact, in the same order, same length."),
});

export type PhraseResponse = z.infer<typeof PhraseRequestSchema>;
