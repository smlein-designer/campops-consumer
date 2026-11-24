import type { ReactNode } from "react";
import { BookingCard } from "@/components/v3/booking-card";
import { MapPin, type MapPinStatus } from "@/components/v3/map-pin";
import { SegmentedControl } from "@/components/v3/segmented-control";
import {
  bookingCardState,
  bookingCardTitle,
  bookingKindAndTime,
  bookingMeta,
  bookingsByDay,
} from "@/lib/v3/booking-display";
import { photoSrc } from "@/lib/v3/photos";
import { dayHeading } from "@/lib/v3/trip-dates";
import type { Booking, Hold } from "@/lib/v3/schemas";

/** A plan step that isn't booked yet, shown as a Working card. */
export type PendingItem = {
  id: string;
  title: string;
  detail: string;
  paused?: boolean;
  /** Shown in the card's place — e.g. the time picker for an activity waiting on the user. */
  content?: ReactNode;
};

export type MapPoint = {
  id: string;
  lat: number;
  lng: number;
  status: MapPinStatus;
  place: string;
  detail: string;
  /** Drive minutes from base camp. */
  minutes?: number;
  /** A water activity sits on the shore; a hike sits up in the hills. */
  kind?: "water" | "hike";
};

export type MapWater = "creek" | "river" | "lake" | "beach" | "none";

const VIEWS = ["By day", "On the map"];

/** "Booked · free cancel to Apr 9" — the refund terms a confirmed booking keeps. */
function bookedLabel(booking: Booking): string {
  const until = booking.refundTerms.match(/until (\w+ \d+)/);
  if (until) return `Booked · free cancel to ${until[1]}`;
  const hours = booking.refundTerms.match(/up to (\d+) hours/);
  return hours
    ? `Booked · refund to ${hours[1]} hrs before`
    : "Booked · confirmed";
}

function statusLabel(booking: Booking): string | undefined {
  if (booking.status === "approved") return bookedLabel(booking);
  if (booking.status === "hold_expired") return "Hold ran out";
  return undefined;
}

// Figma node 12:443: the same plan placed by where things really are — base
// camp and each provider from their own coordinates, the water the site is
// on, hills around the hike, and a dotted route out from camp to each stop.
// Drawn in a 1000×400 box that stretches to the map's size.
const W = 1000;
const H = 400;

function TripMap({
  points,
  water = "none",
}: {
  points: MapPoint[];
  water?: MapWater;
}) {
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const span = (values: number[]) =>
    Math.max(Math.max(...values) - Math.min(...values), 0.01);
  // Pins stay inside the box, with room above for the legend.
  const placed = points.map((p) => ({
    ...p,
    x: 110 + ((p.lng - Math.min(...lngs)) / span(lngs)) * 640,
    y: 330 - ((p.lat - Math.min(...lats)) / span(lats)) * 230,
  }));
  const base = placed.find((p) => p.status === "base") ?? placed[0];
  const stops = placed.filter((p) => p !== base);

  // Which way is "away from the activities" — water and hills go there
  // unless a stop says otherwise.
  const away = (() => {
    if (stops.length === 0) return { x: 0.55, y: -0.83 };
    const cx = stops.reduce((s, p) => s + p.x, 0) / stops.length - base.x;
    const cy = stops.reduce((s, p) => s + p.y, 0) / stops.length - base.y;
    const len = Math.hypot(cx, cy) || 1;
    return { x: -cx / len, y: -cy / len };
  })();

  // A lake whose shore runs through base camp — and through the marina, when
  // there is one, so both sit on the water's edge. Of the two sides it could
  // sit on, take the one that keeps the other stops dry and the lake in view.
  let lake: { cx: number; cy: number; r: number } | null = null;
  if (water === "lake" || water === "beach") {
    const shore = stops.find(
      (p) => p.kind === "water" && Math.hypot(p.x - base.x, p.y - base.y) > 20,
    );
    const minR = water === "beach" ? 260 : 150;
    const candidates: { cx: number; cy: number; r: number }[] = [];
    if (shore) {
      const mx = (base.x + shore.x) / 2;
      const my = (base.y + shore.y) / 2;
      const half = Math.hypot(shore.x - base.x, shore.y - base.y) / 2;
      const nx = -(shore.y - base.y) / (half * 2);
      const ny = (shore.x - base.x) / (half * 2);
      const r = Math.max(half * 1.25, minR);
      const out = Math.sqrt(r * r - half * half);
      candidates.push(
        { cx: mx + nx * out, cy: my + ny * out, r },
        { cx: mx - nx * out, cy: my - ny * out, r },
      );
    } else {
      for (const turn of [0, Math.PI / 2, -Math.PI / 2, Math.PI]) {
        const a = Math.atan2(away.y, away.x) + turn;
        candidates.push({
          cx: base.x + Math.cos(a) * minR,
          cy: base.y + Math.sin(a) * minR,
          r: minR,
        });
      }
    }
    const cost = (c: { cx: number; cy: number; r: number }) =>
      stops.filter(
        (p) => p !== shore && Math.hypot(p.x - c.cx, p.y - c.cy) < c.r + 12,
      ).length *
        10_000 +
      Math.hypot(c.cx - W / 2, c.cy - H / 2);
    lake = candidates.reduce((best, c) => (cost(c) < cost(best) ? c : best));
  }

  // Hills: rings around the hike, or across from the water.
  const hike = stops.find((p) => p.kind === "hike");
  const hill = hike ?? {
    x: lake ? (lake.cx > W / 2 ? 170 : 830) : base.x - away.x * 260,
    y: 320,
  };

  // Each route bows a little, like a road rather than a ruler line — and
  // bows away from the lake, so it doesn't drive across the water.
  const route = (p: (typeof placed)[number]) => {
    const mx = (base.x + p.x) / 2;
    const my = (base.y + p.y) / 2;
    const bend = { x: -(p.y - base.y) * 0.3, y: (p.x - base.x) * 0.3 };
    const toward = lake
      ? Math.hypot(mx + bend.x - lake.cx, my + bend.y - lake.cy) <
        Math.hypot(mx - bend.x - lake.cx, my - bend.y - lake.cy)
      : false;
    const s = toward ? -1 : 1;
    return `M ${base.x} ${base.y} Q ${mx + s * bend.x} ${my + s * bend.y} ${p.x} ${p.y}`;
  };

  const farthest = Math.max(0, ...stops.map((p) => p.minutes ?? 0));
  const legend =
    farthest > 0
      ? `Everything within ${Math.ceil(farthest / 5) * 5} min of ${base.place.split(", ").pop()}`
      : null;

  // On a phone the map keeps its shape and scrolls sideways rather than
  // squeezing the pins and the lake together.
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--color-border-default)]">
      <div className="relative h-[400px] min-w-[720px] overflow-hidden bg-[var(--color-bg-held)]">
        <svg
          className="absolute inset-0 size-full"
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          aria-hidden
        >
          <g
            fill="none"
            stroke="var(--color-border-strong)"
            strokeWidth={1.2}
            vectorEffect="non-scaling-stroke"
          >
            <path
              d="M -10 52 C 220 30, 520 84, 1010 62"
              vectorEffect="non-scaling-stroke"
            />
            <path
              d="M -10 108 C 260 84, 580 138, 1010 118"
              vectorEffect="non-scaling-stroke"
            />
            {[1, 1.7, 2.4].map((k) => (
              <ellipse
                key={k}
                cx={hill.x}
                cy={hill.y}
                rx={52 * k}
                ry={34 * k}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </g>
          {lake && (
            <circle
              cx={lake.cx}
              cy={lake.cy}
              r={lake.r}
              fill="var(--color-bg-info)"
            />
          )}
          {(water === "river" || water === "creek") && (
            <path
              d={`M -20 ${base.y - 70} C ${base.x * 0.5} ${base.y - 100}, ${base.x - 90} ${base.y + 40}, ${base.x} ${base.y + 18} S ${base.x + 320} ${base.y + 70} ${W + 20} ${base.y + 24}`}
              fill="none"
              stroke="var(--color-bg-info)"
              strokeWidth={water === "river" ? 22 : 10}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          )}
          <g
            fill="none"
            stroke="var(--color-bg-brand)"
            strokeWidth={2}
            strokeDasharray="2 6"
            strokeLinecap="round"
          >
            {stops.map((p) => (
              <path key={p.id} d={route(p)} vectorEffect="non-scaling-stroke" />
            ))}
          </g>
        </svg>
        {legend && (
          <p className="text-label-s absolute top-4 left-4 rounded-full bg-[var(--color-bg-surface)] px-3.5 py-2 text-[var(--color-text-primary)]">
            {legend}
          </p>
        )}
        {[...stops, base].map((p) => {
          const left = p.x > 640;
          const half = p.status === "base" ? 11 : 9;
          return (
            <div
              key={p.id}
              className="absolute"
              style={{
                top: `${(p.y / H) * 100}%`,
                ...(left
                  ? { right: `${100 - (p.x / W) * 100}%` }
                  : { left: `${(p.x / W) * 100}%` }),
                transform: `translate(${left ? half : -half}px, -50%)`,
              }}
            >
              <MapPin
                status={p.status}
                place={p.place}
                detail={p.detail}
                labelSide={left ? "left" : "right"}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Figma node 4:30: day COLUMNS side by side (one per day that has a
// booking), each stacking its own cards.
export function Itinerary({
  title = "Your itinerary",
  bookings,
  holds = [],
  pending = [],
  pendingTitle = "Still planning",
  photoByBookingId,
  onRelease,
  onDetails,
  onCompare,
  showHeader = true,
  view = "By day",
  onViewChange,
  mapPoints = [],
  mapWater,
}: {
  title?: string;
  bookings: Booking[];
  /** Live holds, for each held card's countdown. */
  holds?: Hold[];
  /** Plan steps still being worked on. */
  pending?: PendingItem[];
  /** The heading over the pending column. */
  pendingTitle?: string;
  /** Overrides a booking's own photo, keyed by booking id. */
  photoByBookingId?: Record<string, string>;
  onRelease?: (bookingId: string) => void;
  /** Opens a campsite's details, or the time and party picker for a held activity. */
  onDetails?: (bookingId: string) => void;
  /** Shows the other campsites that fit, from the held campsite's card. */
  onCompare?: () => void;
  /** Set false when the caller renders its own heading + view switch. */
  showHeader?: boolean;
  view?: string;
  onViewChange?: (view: string) => void;
  mapPoints?: MapPoint[];
  /** The water base camp is on, drawn under the pins. */
  mapWater?: MapWater;
}) {
  const groups = bookingsByDay(bookings);
  return (
    <div className="space-y-4">
      {showHeader && (
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-heading-s text-[var(--color-text-primary)] md:text-heading-m">
            {title}
          </h2>
          <SegmentedControl
            options={VIEWS}
            selected={view}
            onChange={onViewChange}
          />
        </div>
      )}
      {view === "On the map" && mapPoints.length > 0 ? (
        <TripMap points={mapPoints} water={mapWater} />
      ) : (
        <div className="flex flex-col gap-4 md:flex-row md:items-start">
          {groups.map((group) => (
            <div key={group.day} className="flex min-w-0 flex-1 flex-col gap-2">
              <p className="text-overline text-[var(--color-text-secondary)]">
                {dayHeading(group.day)}
              </p>
              {group.items.map((booking) => {
                const hold = holds.find((h) => h.id === booking.holdId);
                const photo =
                  photoByBookingId?.[booking.id] ??
                  (booking.photoKey ? photoSrc(booking.photoKey) : undefined);
                return (
                  <BookingCard
                    key={booking.id}
                    state={bookingCardState(booking.status)}
                    kind={bookingKindAndTime(booking)}
                    title={bookingCardTitle(booking)}
                    meta={bookingMeta(booking)}
                    statusLabel={statusLabel(booking)}
                    holdEndsAt={hold ? new Date(hold.expiresAt) : undefined}
                    showPhoto={!!photo}
                    photo={photo}
                    onRelease={
                      onRelease && booking.status === "held"
                        ? () => onRelease(booking.id)
                        : undefined
                    }
                    onDetails={
                      onDetails &&
                      (booking.kind === "campsite" ||
                        (booking.kind === "activity" &&
                          booking.status === "held"))
                        ? () => onDetails(booking.id)
                        : undefined
                    }
                    detailsLabel={
                      booking.kind === "activity" ? "Change" : "Details"
                    }
                    onCompare={
                      booking.kind === "campsite" && booking.status === "held"
                        ? onCompare
                        : undefined
                    }
                  />
                );
              })}
            </div>
          ))}
          {pending.length > 0 && (
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <p className="text-overline text-[var(--color-text-secondary)]">
                {pendingTitle}
              </p>
              {pending.map((item) =>
                item.content ? (
                  <div key={item.id}>{item.content}</div>
                ) : (
                  <BookingCard
                    key={item.id}
                    state="working"
                    kind="In progress"
                    title={item.title}
                    meta={item.detail}
                    statusLabel={item.paused ? "Paused" : undefined}
                  />
                ),
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
