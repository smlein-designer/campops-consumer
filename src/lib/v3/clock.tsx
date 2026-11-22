"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

/**
 * The single clock that drives every countdown (Build Brief §7, §17): a
 * virtual "now" that every Hold/Condition reads instead of calling
 * `Date.now()` directly, so every timer in the app always agrees. `speed`
 * lets the demo panel (stage 7) fast-forward holds without touching the
 * system clock — paced by default, per the brief's recommendation.
 */
type ClockContextValue = {
  now: number; // virtual epoch ms
  speed: number;
  setSpeed: (speed: number) => void;
};

const ClockContext = createContext<ClockContextValue | null>(null);

const TICK_MS = 250;

export function ClockProvider({ children }: { children: ReactNode }) {
  const [now, setNow] = useState(() => Date.now());
  const [speed, setSpeedState] = useState(1);
  const speedRef = useRef(1);

  useEffect(() => {
    const interval = setInterval(() => {
      setNow((prev) => prev + TICK_MS * speedRef.current);
    }, TICK_MS);
    return () => clearInterval(interval);
  }, []);

  function setSpeed(next: number) {
    speedRef.current = next;
    setSpeedState(next);
  }

  return <ClockContext.Provider value={{ now, speed, setSpeed }}>{children}</ClockContext.Provider>;
}

export function useClock(): ClockContextValue {
  const ctx = useContext(ClockContext);
  if (!ctx) throw new Error("useClock must be used within a ClockProvider");
  return ctx;
}
