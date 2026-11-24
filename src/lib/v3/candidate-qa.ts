import { answerCandidateQuestion, detectCandidateQuestion } from "@/lib/candidate-facts";
import { shownCampsite } from "@/lib/v3/agent-loop";
import { originZip, tripRange } from "@/lib/v3/search";
import type { Trip } from "@/lib/v3/schemas";

/**
 * Factual Q&A about the campsite on screen (v2's candidate follow-up): a
 * question about "it" is answered from the site's real record, with no
 * model call and no change to the trip. This is the fast deterministic
 * path; a question it doesn't recognise still reaches the model, which can
 * classify it (see applyTurn's candidateQuestion branch).
 */
export function tryAnswerCandidateQuestion(trip: Trip, rawMessage: string): string | null {
  const site = shownCampsite(trip);
  if (!site) return null;
  const detection = detectCandidateQuestion(rawMessage);
  if (detection.kind !== "question") return null;
  const range = tripRange(trip.intent);
  return answerCandidateQuestion(detection.topic, site, {
    originZip: originZip(trip.intent),
    checkIn: range ? trip.intent.checkIn : null,
    checkOut: range ? trip.intent.checkOut : null,
    amenityHint: detection.topic === "amenity" ? detection.amenityHint : null,
  });
}
