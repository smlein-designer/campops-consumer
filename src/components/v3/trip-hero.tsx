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
        "relative flex flex-col justify-end overflow-hidden px-4 md:px-8",
        size === "large" ? "min-h-[220px] pt-12 pb-5 md:h-64 md:pb-7" : "min-h-[150px] pt-10 pb-4 md:h-[180px] md:pb-[22px]",
      )}
      style={
        photo
          ? {
              backgroundImage: `linear-gradient(to bottom, rgba(10,18,13,0.05) 25%, rgba(10,18,13,0.72) 100%), url(${photo})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }
          : { backgroundColor: "var(--color-bg-subtle)" }
      }
    >
      <p className="text-overline text-[#edebe0]">{status}</p>
      <p className={cn(size === "large" ? "text-heading-l md:text-display-l" : "text-heading-m md:text-heading-l", "text-white")}>{title}</p>
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
