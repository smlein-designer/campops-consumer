import type { ForecastDay } from "@/lib/v3/schemas";

/**
 * Mocked 3-day forecast (Build Brief §5) for the golden-path trip dates. The
 * Saturday storm is the scripted condition a later stage turns into a real
 * Condition + replan (Build Brief §11).
 */
export const FORECAST: ForecastDay[] = [
  { date: "2027-04-16", condition: "Partly cloudy", stormChancePercent: 10 },
  {
    date: "2027-04-17",
    condition: "Storms likely",
    stormChancePercent: 70,
    stormWindow: { start: "14:00", end: "18:00" },
  },
  { date: "2027-04-18", condition: "Clear", stormChancePercent: 5 },
];
