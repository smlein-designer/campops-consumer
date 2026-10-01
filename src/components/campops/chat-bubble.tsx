import { text } from "@/lib/typography";

/**
 * Chat message bubble (CampOps DS "Chat Bubble", Sender = User | Agent).
 *
 * Hugs its own content up to a max-width cap, then wraps — never stretches
 * to fill its row. Alignment is handled by the parent row, not the bubble.
 * 16px corners with one square "tail" corner on the sender's side
 * (bottom-right for the user, bottom-left for the agent).
 *
 * Cap is responsive by default (Handoff Spec 2.3: "280px mobile, 640px
 * desktop, set per placement") — callers that pass an explicit narrower
 * desktop cap (e.g. the Closing screen's 480px) should pass a responsive
 * pair of their own rather than a single fixed value.
 */
export function ChatBubble({
  sender,
  message,
  maxWidthClassName = "max-w-[280px] lg:max-w-[640px]",
}: {
  sender: "user" | "agent";
  message: string;
  maxWidthClassName?: string;
}) {
  const isUser = sender === "user";
  return (
    <div
      className={`w-fit ${maxWidthClassName} rounded-xl px-4 py-2 ${text.bodyBase} ${
        isUser
          ? "rounded-br-none bg-water text-primary-foreground"
          : "rounded-bl-none border border-border bg-card text-card-foreground"
      }`}
    >
      {message}
    </div>
  );
}

export function ChatRow({
  sender,
  children,
}: {
  sender: "user" | "agent";
  children: React.ReactNode;
}) {
  return (
    <div
      className={`flex w-full ${sender === "user" ? "justify-end" : "justify-start"}`}
    >
      {children}
    </div>
  );
}
