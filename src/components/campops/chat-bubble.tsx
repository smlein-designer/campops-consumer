import { text } from "@/lib/typography";

/**
 * Chat message bubble (Handoff Spec 2.3 / Figma DS node 2056:115).
 *
 * Hugs its own content up to a max-width cap, then wraps — never stretches
 * to fill its row. Alignment is handled by the parent row, not the bubble.
 */
export function ChatBubble({
  sender,
  message,
  maxWidthClassName = "max-w-[640px]",
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
          ? "bg-water text-primary-foreground"
          : "border border-border bg-card text-card-foreground"
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
