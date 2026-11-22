import { BookingCard } from "@/components/v3/booking-card";
import { bookingCardState, bookingKindLabel, bookingMeta, bookingsByDay } from "@/lib/v3/booking-display";
import type { Booking } from "@/lib/v3/schemas";

export function Itinerary({
  title = "Your itinerary",
  bookings,
  photoByBookingId,
  onRelease,
}: {
  title?: string;
  bookings: Booking[];
  /** Photo src for a booking's thumbnail (campsite bookings only), keyed by booking id. */
  photoByBookingId?: Record<string, string>;
  onRelease?: (bookingId: string) => void;
}) {
  const groups = bookingsByDay(bookings);
  return (
    <div className="space-y-4">
      <h2 className="text-heading-m text-[var(--color-text-primary)]">{title}</h2>
      <div className="space-y-6">
        {groups.map((group) => (
          <div key={group.day} className="space-y-3">
            <p className="text-overline text-[var(--color-text-tertiary)]">{group.day}</p>
            <div className="space-y-3">
              {group.items.map((booking) => (
                <BookingCard
                  key={booking.id}
                  state={bookingCardState(booking.status)}
                  kind={bookingKindLabel(booking.kind)}
                  title={booking.title}
                  meta={bookingMeta(booking)}
                  showPhoto={booking.kind === "campsite"}
                  photo={photoByBookingId?.[booking.id]}
                  onRelease={onRelease && booking.status === "held" ? () => onRelease(booking.id) : undefined}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
