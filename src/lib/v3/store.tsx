"use client";

import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from "react";
import type {
  AgentState,
  Authorization,
  Booking,
  Condition,
  Hold,
  NeedsYouItem,
  Permission,
  Suggestion,
  Trip,
  TripEvent,
  TripPlanStep,
} from "@/lib/v3/schemas";

/**
 * The single store (Build Brief §13: "A single store is recommended now
 * that many parts of the screen read the same booking state"). This is
 * plain state + a reducer — the rules that decide WHEN to dispatch these
 * actions (dependency/permission checks, the agent loop) are separate
 * engines built in later stages; the store itself is agnostic of them.
 */
export type TripAction =
  | { type: "SET_PLAN"; plan: TripPlanStep[] }
  | { type: "SET_PLAN_STEP_STATUS"; stepId: string; status: TripPlanStep["status"] }
  | { type: "SET_AGENT"; agent: Partial<AgentState> }
  | { type: "UPSERT_BOOKING"; booking: Booking }
  | { type: "SET_BOOKING_STATUS"; bookingId: string; status: Booking["status"]; changeNote?: string }
  | { type: "REMOVE_BOOKING"; bookingId: string }
  | { type: "ADD_HOLD"; hold: Hold }
  | { type: "REMOVE_HOLD"; holdId: string }
  | { type: "SET_PERMISSION"; permissionId: Permission["id"]; enabled: boolean }
  | { type: "PUSH_NEEDS_YOU"; item: NeedsYouItem }
  | { type: "RESOLVE_NEEDS_YOU"; itemId: string }
  | { type: "SET_SUGGESTION"; suggestion: Suggestion }
  | { type: "DISMISS_SUGGESTION_TYPE"; activityType: string }
  | { type: "ADD_CONDITION"; condition: Condition }
  | { type: "ADD_EVENT"; event: TripEvent }
  | { type: "SET_AUTHORIZATION"; authorization: Partial<Authorization> }
  | { type: "RESET"; trip: Trip };

export function tripReducer(trip: Trip, action: TripAction): Trip {
  switch (action.type) {
    case "SET_PLAN":
      return { ...trip, plan: action.plan };
    case "SET_PLAN_STEP_STATUS":
      return {
        ...trip,
        plan: trip.plan.map((step) => (step.id === action.stepId ? { ...step, status: action.status } : step)),
      };
    case "SET_AGENT":
      return { ...trip, agent: { ...trip.agent, ...action.agent } };
    case "UPSERT_BOOKING": {
      const exists = trip.bookings.some((b) => b.id === action.booking.id);
      return {
        ...trip,
        bookings: exists
          ? trip.bookings.map((b) => (b.id === action.booking.id ? action.booking : b))
          : [...trip.bookings, action.booking],
      };
    }
    case "SET_BOOKING_STATUS":
      return {
        ...trip,
        bookings: trip.bookings.map((b) =>
          b.id === action.bookingId
            ? { ...b, status: action.status, changeNote: action.changeNote ?? b.changeNote }
            : b,
        ),
      };
    case "REMOVE_BOOKING":
      return { ...trip, bookings: trip.bookings.filter((b) => b.id !== action.bookingId) };
    case "ADD_HOLD":
      return { ...trip, holds: [...trip.holds, action.hold] };
    case "REMOVE_HOLD":
      return { ...trip, holds: trip.holds.filter((h) => h.id !== action.holdId) };
    case "SET_PERMISSION":
      return {
        ...trip,
        permissions: trip.permissions.map((p) =>
          p.id === action.permissionId && !p.locked ? { ...p, enabled: action.enabled } : p,
        ),
      };
    case "PUSH_NEEDS_YOU":
      return { ...trip, needsYouQueue: [...trip.needsYouQueue, action.item] };
    case "RESOLVE_NEEDS_YOU":
      return { ...trip, needsYouQueue: trip.needsYouQueue.filter((i) => i.id !== action.itemId) };
    case "SET_SUGGESTION": {
      const exists = trip.suggestions.some((s) => s.id === action.suggestion.id);
      return {
        ...trip,
        suggestions: exists
          ? trip.suggestions.map((s) => (s.id === action.suggestion.id ? action.suggestion : s))
          : [...trip.suggestions, action.suggestion],
      };
    }
    case "DISMISS_SUGGESTION_TYPE":
      return { ...trip, dismissedSuggestionTypes: [...trip.dismissedSuggestionTypes, action.activityType] };
    case "ADD_CONDITION":
      return { ...trip, conditions: [...trip.conditions, action.condition] };
    case "ADD_EVENT":
      return { ...trip, events: [...trip.events, action.event] };
    case "SET_AUTHORIZATION":
      return { ...trip, authorization: { ...trip.authorization, ...action.authorization } };
    case "RESET":
      return action.trip;
    default:
      return trip;
  }
}

type TripContextValue = { trip: Trip; dispatch: Dispatch<TripAction> };
const TripContext = createContext<TripContextValue | null>(null);

export function TripProvider({ initialTrip, children }: { initialTrip: Trip; children: ReactNode }) {
  const [trip, dispatch] = useReducer(tripReducer, initialTrip);
  return <TripContext.Provider value={{ trip, dispatch }}>{children}</TripContext.Provider>;
}

export function useTrip(): TripContextValue {
  const ctx = useContext(TripContext);
  if (!ctx) throw new Error("useTrip must be used within a TripProvider");
  return ctx;
}
