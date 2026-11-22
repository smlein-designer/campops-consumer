import { BookingCard } from "@/components/v3/booking-card";
import { SegmentedControl } from "@/components/v3/segmented-control";
import { bookingCardState, bookingKindAndTime, bookingMeta, bookingsByDay } from "@/lib/v3/booking-display";
import type { Booking } from "@/lib/v3/schemas";

// Figma node 4:30: day COLUMNS side by side (one per day that has a
// booking), each stacking its own cards — not a single list grouped under
// day headers.
export function Itinerary({
  title = "Your itinerary",
  bookings,
  photoByBookingId,
  onRelease,
  showHeader = true,
}: {
  title?: string;
  bookings: Booking[];
  /** Photo src for a booking's thumbnail (campsite bookings only), keyed by booking id. */
  photoByBookingId?: Record<string, string>;
  onRelease?: (bookingId: string) => void;
  /** Set false when the caller renders its own heading + view switch (e.g. the Map screen). */
  showHeader?: boolean;
}) {
  const groups = bookingsByDay(bookings);
  return (
    <div className="space-y-4">
      {showHeader && (
        <div className="flex items-center justify-between">
          <h2 className="text-heading-m text-[var(--color-text-primary)]">{title}</h2>
          <SegmentedControl options={["By day", "On the map"]} selected="By day" />
        </div>
      )}
      <div className="flex flex-col gap-4 md:flex-row md:items-start">
        {groups.map((group) => (
          <div key={group.day} className="flex min-w-0 flex-1 flex-col gap-2">
            <p className="text-label-s text-[var(--color-text-secondary)] uppercase tracking-[0.06em]">{group.day}</p>
            {group.items.map((booking) => (
              <BookingCard
                key={booking.id}
                state={bookingCardState(booking.status)}
                kind={bookingKindAndTime(booking)}
                title={booking.title}
                meta={bookingMeta(booking)}
                showPhoto={booking.kind === "campsite"}
                photo={photoByBookingId?.[booking.id]}
                onRelease={onRelease && booking.status === "held" ? () => onRelease(booking.id) : undefined}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
