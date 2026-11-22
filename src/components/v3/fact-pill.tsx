// Only used over darkened photos (Handoff Spec §3) — the fixed
// black/backdrop-blur treatment assumes that background everywhere it renders.
export function FactPill({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-black/40 px-2.5 py-1 text-label-s whitespace-nowrap text-white backdrop-blur-sm">
      {label}
    </span>
  );
}
