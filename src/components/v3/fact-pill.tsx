// Figma node 15:29 — one trip fact over hero photography: white text on
// translucent white, rounded-md (not full), Body/S.
export function FactPill({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-md bg-white/[0.16] px-3 py-1.5 text-body-s whitespace-nowrap text-white">
      {label}
    </span>
  );
}
