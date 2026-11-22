"use client";

import { useState } from "react";
import { Button } from "@/components/v3/button";

export function Composer({
  placeholder = "Tell CampOps...",
  onSubmit,
}: {
  placeholder?: string;
  onSubmit?: (value: string) => void;
}) {
  const [value, setValue] = useState("");

  function submit() {
    if (!value.trim()) return;
    onSubmit?.(value);
    setValue("");
  }

  return (
    <div className="flex items-center gap-2 rounded-full border border-[var(--color-border-strong)] bg-[var(--color-bg-surface)] px-4 py-2">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent text-body-m text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-tertiary)]"
      />
      <Button variant="primary" label="Send" onClick={submit} />
    </div>
  );
}
