import { cn } from "@/lib/utils";

// Figma node 2:45. User turns are forest-filled speech bubbles with a
// corner tail, right-aligned; agent turns are plain canvas-colored cards,
// left-aligned — a system message, not a second speaker.
export function ChatBubble({ from, message }: { from: "user" | "agent"; message: string }) {
  const isUser = from === "user";
  return (
    <div className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}>
      {isUser ? (
        <div className="relative max-w-[300px]">
          <div className="rounded-tl-xl rounded-tr-xl rounded-bl-xl bg-[var(--color-bg-brand)] px-4 py-2 text-body-m text-[var(--color-text-on-brand)]">
            {message}
          </div>
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            className="absolute right-0 bottom-0 translate-x-px translate-y-px"
            aria-hidden
          >
            <path d="M0 0C0 8.83656 7.16344 16 16 16H0V0Z" fill="var(--color-bg-brand)" />
          </svg>
        </div>
      ) : (
        <div className="max-w-[300px] rounded-tl-xl rounded-tr-xl rounded-br-xl rounded-bl-sm bg-[var(--color-bg-canvas)] px-4 py-2 text-body-m text-[var(--color-text-primary)]">
          {message}
        </div>
      )}
    </div>
  );
}
