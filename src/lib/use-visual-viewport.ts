"use client";

import { useEffect, useRef } from "react";

/**
 * Software-keyboard handling via the VisualViewport API — no hardcoded
 * keyboard height. On iOS Safari (and any browser that ignores the
 * `interactive-widget=resizes-content` viewport setting), the keyboard
 * shrinks only the *visual* viewport, leaving `100dvh` and `position: fixed;
 * bottom: 0` anchored to the full layout viewport, behind the keyboard.
 *
 * This hook mirrors the visual viewport onto three CSS custom properties on
 * <html>, batched to one write per animation frame:
 *  - `--app-height`: the visible height — the app shell's height.
 *  - `--app-top`: how far the browser has panned the visible area down
 *    within the layout viewport — the app shell's top, so the header and
 *    status bar stay at the visible top instead of sliding away.
 *  - `--keyboard-inset`: the layout-viewport space below the visible area
 *    (the keyboard) — the bottom offset of the fixed mobile foreground layer.
 * and sets `data-keyboard-open` on <html> while the software keyboard is up
 * (used to hide the Your Trip grab bar and tighten the composer layer).
 *
 * Where the browser already resized the layout for the keyboard (Android
 * Chrome with `resizes-content`), and on desktop, the visible area equals
 * the window, so every positioning value is neutral. On that Android path
 * the keyboard leaves no inset to measure, so "keyboard open" is also
 * detected as: a text field is focused AND the visible height has dropped
 * well below the full height seen at this width (the keyboard took it).
 * The threshold ignores the browser's own toolbar showing/hiding.
 * Pinch-zoom also shrinks the visual viewport; while zoomed (scale > 1) the
 * values are held neutral so zooming never resizes the app.
 *
 * `getScroller` returns the active content scroll region. If its newest
 * content was in view before a resize, it is kept in view afterwards (chat
 * anchoring); otherwise the reader's scroll position is left alone. With
 * `revealFocusedInput`, a focused input inside that region is also kept in
 * view (Start, where the composer is in normal flow).
 */
export function useVisualViewport(
  getScroller: () => HTMLElement | null,
  options: { revealFocusedInput?: boolean } = {},
) {
  // Read the latest callback/options from refs so the listeners attach once.
  const getScrollerRef = useRef(getScroller);
  const optionsRef = useRef(options);
  useEffect(() => {
    getScrollerRef.current = getScroller;
    optionsRef.current = options;
  });

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    let frame = 0;
    // Full (keyboard-free) layout height for the current width; reset on a
    // width change such as rotation.
    let baseWidth = window.innerWidth;
    let fullHeight = window.innerHeight;
    let appliedHeight = -1;

    const textFieldFocused = () => {
      const el = document.activeElement;
      return (
        el instanceof HTMLTextAreaElement ||
        (el instanceof HTMLElement && el.isContentEditable) ||
        (el instanceof HTMLInputElement &&
          !["button", "checkbox", "radio", "range", "submit", "reset", "file", "color"].includes(el.type))
      );
    };

    const apply = () => {
      frame = 0;
      const zoomed = vv.scale > 1.01;
      const height = zoomed ? window.innerHeight : vv.height;
      const top = zoomed ? 0 : vv.offsetTop;
      const inset = Math.max(0, Math.round(window.innerHeight - height - top));
      if (window.innerWidth !== baseWidth) {
        baseWidth = window.innerWidth;
        fullHeight = window.innerHeight;
      } else {
        fullHeight = Math.max(fullHeight, window.innerHeight);
      }
      const keyboardOpen =
        !zoomed &&
        (inset > 0 || (textFieldFocused() && fullHeight - height > 120));

      const scroller = getScrollerRef.current();
      const wasAtEnd =
        !!scroller &&
        scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 8;

      root.style.setProperty("--app-height", `${height}px`);
      root.style.setProperty("--app-top", `${top}px`);
      root.style.setProperty("--keyboard-inset", `${inset}px`);
      root.toggleAttribute("data-keyboard-open", keyboardOpen);

      // Keep the end in view only when the visible height actually changed
      // (keyboard opening/closing) — a plain focus change, like tapping a
      // button, must not undo a reveal scroll that is already under way.
      const resized = height !== appliedHeight;
      appliedHeight = height;
      if (!scroller) return;
      if (wasAtEnd && resized) scroller.scrollTop = scroller.scrollHeight;
      const focused = document.activeElement;
      if (
        optionsRef.current.revealFocusedInput &&
        focused instanceof HTMLElement &&
        scroller.contains(focused)
      ) {
        focused.scrollIntoView({ block: "nearest" });
      }
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(apply);
    };

    apply();
    vv.addEventListener("resize", schedule);
    vv.addEventListener("scroll", schedule);
    document.addEventListener("focusin", schedule);
    document.addEventListener("focusout", schedule);
    return () => {
      cancelAnimationFrame(frame);
      vv.removeEventListener("resize", schedule);
      vv.removeEventListener("scroll", schedule);
      document.removeEventListener("focusin", schedule);
      document.removeEventListener("focusout", schedule);
      for (const p of ["--app-height", "--app-top", "--keyboard-inset"]) {
        root.style.removeProperty(p);
      }
      root.removeAttribute("data-keyboard-open");
    };
  }, []);
}
