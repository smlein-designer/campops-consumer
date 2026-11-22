export type TimeSlot = { date: string; startTime: string; endTime: string };

/**
 * No two held or planned activities may overlap (Build Brief §10). Same-day
 * check only — different dates never overlap regardless of time-of-day.
 */
export function slotsOverlap(a: TimeSlot, b: TimeSlot): boolean {
  if (a.date !== b.date) return false;
  return a.startTime < b.endTime && b.startTime < a.endTime;
}
