import { cn } from "@/lib/utils";
import { FactPill } from "@/components/v3/fact-pill";

export function TripHero({
  size,
  status,
  title,
  photo,
  facts,
}: {
  size: "large" | "compact";
  status: string;
  title: string;
  photo?: string;
  facts?: string[];
}) {
  return (
    <div
      className={cn(
        "relative flex flex-col justify-end overflow-hidden rounded-xl p-6",
        size === "large" ? "h-64" : "h-[180px]",
      )}
      style={
        photo
          ? {
              backgroundImage: `linear-gradient(to top, rgb(0 0 0 / 0.55), rgb(0 0 0 / 0.05)), url(${photo})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }
          : { backgroundColor: "var(--color-bg-subtle)" }
      }
    >
      <p className="text-overline text-white/80">{status}</p>
      <p className={cn(size === "large" ? "text-display-l" : "text-heading-l", "text-white")}>{title}</p>
      {size === "large" && facts && facts.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {facts.map((fact) => (
            <FactPill key={fact} label={fact} />
          ))}
        </div>
      )}
    </div>
  );
}
