"use client";

import { useRef } from "react";
import { Maximize2, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A details-page header photo that opens full screen. The expand icon in the
 * corner says it can; the native <dialog> gives Esc to close and keeps focus
 * inside while it's open. A click anywhere in the full-screen view closes it.
 */
export function ExpandablePhoto({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        aria-label={`View photo of ${alt} full screen`}
        className={cn("relative block w-full cursor-zoom-in bg-[var(--color-bg-subtle)] bg-cover bg-center", className)}
        style={{ backgroundImage: `url(${src})` }}
      >
        <span className="absolute top-3 right-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white">
          <Maximize2 size={16} aria-hidden />
        </span>
      </button>
      <dialog
        ref={dialog}
        aria-label={alt}
        onClick={() => dialog.current?.close()}
        className="fixed inset-0 m-0 h-full max-h-none w-full max-w-none cursor-zoom-out bg-transparent p-0 backdrop:bg-black/90"
      >
        <div
          role="img"
          aria-label={alt}
          className="h-full w-full bg-contain bg-center bg-no-repeat"
          style={{ backgroundImage: `url(${src})`, backgroundOrigin: "content-box", padding: "clamp(16px, 4vw, 48px)" }}
        />
        <button
          type="button"
          aria-label="Close full-screen photo"
          className="absolute top-4 right-4 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-black/55 text-white"
        >
          <X size={20} aria-hidden />
        </button>
      </dialog>
    </>
  );
}
