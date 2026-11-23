import {
  answerCandidateQuestion,
  detectCandidateQuestion,
  type CandidateQuestionDetection,
} from "@/lib/candidate-facts";
import { evaluateCampsites } from "@/lib/evaluate";
import { toV2SearchIntent } from "@/lib/v3/search-adapter";
import type { Trip } from "@/lib/v3/schemas";

/**
 * Deterministic factual Q&A about the held campsite, ported from v2
 * (src/lib/candidate-facts.ts) essentially unmodified — it only reads a
 * v2 Campsite record, which v3's campsite bookings already reference by id.
 * Answering never mutates the trip or calls the model: a question about
 * "it" is answered from real structured data, exactly once, with no
 * side effects — the same "model handles language, application handles
 * truth" boundary every other deterministic fact in this app respects.
 */
export { detectCandidateQuestion };
export type { CandidateQuestionDetection };

/** Returns an answer if `rawMessage` is a recognized factual question about
 * the currently held campsite, else null (not a candidate question, or no
 * campsite held yet to ask about). */
export function tryAnswerCandidateQuestion(trip: Trip, rawMessage: string): string | null {
  const campsiteBooking = trip.bookings.find((b) => b.kind === "campsite" && (b.status === "held" || b.status === "changed_needs_ok"));
  if (!campsiteBooking) return null;

  const detection = detectCandidateQuestion(rawMessage);
  if (detection.kind !== "question") return null;

  const site = evaluateCampsites(toV2SearchIntent(trip.intent)).candidates.find(
    (c) => c.campsite.id === campsiteBooking.refId,
  )?.campsite;
  if (!site) return null;

  return answerCandidateQuestion(detection.topic, site, {
    originZip: trip.intent.originZip || null,
    checkIn: trip.intent.checkIn || null,
    checkOut: trip.intent.checkOut || null,
    amenityHint: detection.topic === "amenity" ? detection.amenityHint : null,
  });
}
