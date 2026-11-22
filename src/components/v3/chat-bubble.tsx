import { cn } from "@/lib/utils";

export function ChatBubble({ from, message }: { from: "user" | "agent"; message: string }) {
  const isUser = from === "user";
  return (
    <div className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-3xl px-4 py-2.5 text-body-m",
          isUser
            ? "rounded-br-md bg-[var(--color-bg-brand)] text-[var(--color-text-on-brand)]"
            : "rounded-bl-md bg-[var(--color-bg-subtle)] text-[var(--color-text-primary)]",
        )}
      >
        {message}
      </div>
    </div>
  );
}
