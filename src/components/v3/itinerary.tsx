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

export type MapPoint = { id: string; lat: number; lng: number; status: MapPinStatus; place: string; detail: string };

const VIEWS = ["By day", "On the map"];

/** "Booked · free cancel to Apr 9" — the refund terms a confirmed booking keeps. */
function bookedLabel(booking: Booking): string {
  const until = booking.refundTerms.match(/until (\w+ \d+)/);
  if (until) return `Booked · free cancel to ${until[1]}`;
  const hours = booking.refundTerms.match(/up to (\d+) hours/);
  return hours ? `Booked · refund to ${hours[1]} hrs before` : "Booked · confirmed";
}

function statusLabel(booking: Booking): string | undefined {
  if (booking.status === "approved") return bookedLabel(booking);
  if (booking.status === "hold_expired") return "Hold ran out";
  return undefined;
}

// Figma node 12:443: the same plan placed by where things really are — the
// campsite and each provider, positioned from their own coordinates.
function TripMap({ points }: { points: MapPoint[] }) {
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const span = (values: number[]) => Math.max(Math.max(...values) - Math.min(...values), 0.01);
  return (
    <div className="relative h-80 overflow-hidden rounded-xl border border-[var(--color-border-default)] bg-[var(--forest-100)]">
      <div
        className="absolute inset-0 opacity-60"
        style={{ backgroundImage: "radial-gradient(ellipse at 45% 55%, var(--lake-100) 0%, transparent 45%)" }}
      />
      {points.map((point) => (
        <div
          key={point.id}
          className="absolute -translate-x-1/2 -translate-y-1/2"
          style={{
            left: `${18 + ((point.lng - Math.min(...lngs)) / span(lngs)) * 64}%`,
            top: `${82 - ((point.lat - Math.min(...lats)) / span(lats)) * 64}%`,
          }}
        >
          <MapPin status={point.status} place={point.place} detail={point.detail} />
        </div>
      ))}
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
}) {
  const groups = bookingsByDay(bookings);
  return (
    <div className="space-y-4">
      {showHeader && (
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-heading-s text-[var(--color-text-primary)] md:text-heading-m">{title}</h2>
          <SegmentedControl options={VIEWS} selected={view} onChange={onViewChange} />
        </div>
      )}
      {view === "On the map" && mapPoints.length > 0 ? (
        <TripMap points={mapPoints} />
      ) : (
        <div className="flex flex-col gap-4 md:flex-row md:items-start">
          {groups.map((group) => (
            <div key={group.day} className="flex min-w-0 flex-1 flex-col gap-2">
              <p className="text-overline text-[var(--color-text-secondary)]">{dayHeading(group.day)}</p>
              {group.items.map((booking) => {
                const hold = holds.find((h) => h.id === booking.holdId);
                const photo = photoByBookingId?.[booking.id] ?? (booking.photoKey ? photoSrc(booking.photoKey) : undefined);
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
                    onRelease={onRelease && booking.status === "held" ? () => onRelease(booking.id) : undefined}
                    onDetails={
                      onDetails && (booking.kind === "campsite" || (booking.kind === "activity" && booking.status === "held"))
                        ? () => onDetails(booking.id)
                        : undefined
                    }
                    detailsLabel={booking.kind === "activity" ? "Change" : "Details"}
                    onCompare={booking.kind === "campsite" && booking.status === "held" ? onCompare : undefined}
                  />
                );
              })}
            </div>
          ))}
          {pending.length > 0 && (
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <p className="text-overline text-[var(--color-text-secondary)]">{pendingTitle}</p>
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
