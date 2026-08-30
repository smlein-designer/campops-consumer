import type { Candidate, EvaluationResult } from "@/lib/schemas";

/**
 * Availability-loss recovery (PRD §4/§7, Build Brief §8 `verifyAvailability`
 * tool, Handoff Spec 4.2 "Availability Lost").
 *
 * Everything here is deterministic application logic. The availability
 * change itself must never come from model inference — `verifyAvailability`
 * is a pure predicate over deterministic app state (the `unavailableIds` set
 * the UI's scripted demo trigger populates), and the recovery messages below
 * are built entirely from structured facts already produced by
 * `evaluateCampsites` (no model call is used to phrase them for this slice —
 * see docs/implementation-decisions.md for why).
 */

/** Deterministic availability check — never inferred by the model. */
export function verifyAvailability(
  campsiteId: string,
  unavailableIds: ReadonlySet<string>,
): boolean {
  return !unavailableIds.has(campsiteId);
}

/**
 * Describes what changed between a lost candidate and its replacement,
 * built only from facts the two Candidate records already carry — price,
 * distance, and which hard requirements are preserved vs. newly
 * unsatisfied/unverifiable. Never invents a value neither candidate has.
 */
function describeChange(lost: Candidate, adapted: Candidate): string {
  const parts: string[] = [];

  if (adapted.campsite.pricePerNight !== lost.campsite.pricePerNight) {
    const direction =
      adapted.campsite.pricePerNight > lost.campsite.pricePerNight
        ? "up"
        : "down";
    parts.push(
      `price goes ${direction} to $${adapted.campsite.pricePerNight}/night`,
    );
  }
  if (adapted.campsite.distanceMiles !== lost.campsite.distanceMiles) {
    parts.push(
      `it's ${adapted.campsite.distanceMiles} mi away instead of ${lost.campsite.distanceMiles}`,
    );
  }
  if (adapted.compromises.length > 0) {
    parts.push(adapted.compromises.join("; ").toLowerCase());
  }

  const preservedText =
    adapted.preserved.length > 0
      ? `still satisfies ${adapted.preserved.join(", ")}`
      : null;

  const changeText = parts.length > 0 ? parts.join(", ") : null;

  if (preservedText && changeText)
    return `${preservedText}, though ${changeText}.`;
  if (preservedText) return `${preservedText}.`;
  if (changeText)
    return `${changeText.charAt(0).toUpperCase()}${changeText.slice(1)}.`;
  return "";
}

/**
 * Builds the two agent messages the Handoff Spec requires to appear
 * together in one interaction: state the loss, then immediately present
 * the adapted pick (or the honest lack of one) — never split across a
 * user turn.
 */
export function buildRecoveryMessages(
  lost: Candidate,
  adapted: EvaluationResult,
): { lossMessage: string; adaptedMessage: string } {
  const lossMessage = `${lost.campsite.siteName} at ${lost.campsite.campgroundName} just became unavailable.`;

  const top = adapted.candidates[0];
  if (adapted.kind === "full" && top) {
    return {
      lossMessage,
      adaptedMessage: `The next best option is ${top.campsite.siteName} at ${top.campsite.campgroundName} — ${describeChange(lost, top)}`,
    };
  }
  if (adapted.kind === "compromise" && top) {
    return {
      lossMessage,
      adaptedMessage: `I couldn't find another exact match, but ${top.campsite.siteName} at ${top.campsite.campgroundName} is the closest option — ${describeChange(lost, top)}`,
    };
  }
  return {
    lossMessage,
    adaptedMessage:
      "Nothing left in the current dataset satisfies every requirement you've given me. You can widen a requirement or ask me to try something different.",
  };
}
