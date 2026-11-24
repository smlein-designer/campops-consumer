// Required near any approve or charge action (Handoff Spec §3, §7) — always
// says in words what approving will do, since color/amount alone isn't enough.
export function CommitNote({ message }: { message: string }) {
  return <p className="text-caption text-[var(--color-text-tertiary)]">{message}</p>;
}
