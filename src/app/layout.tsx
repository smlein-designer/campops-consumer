import type { Metadata, Viewport } from "next";
import { Geist_Mono, National_Park, Inter } from "next/font/google";
import "./globals.css";

// v3 type ramp (Handoff Spec 1.3) — Display/Heading/Price styles use
// National Park ExtraBold, everything else uses Inter. Inter replaces v2's
// Public Sans.
const nationalPark = National_Park({
  variable: "--font-national-park",
  weight: "800",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  weight: ["400", "600"],
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CampOps",
  description: "CampOps Consumer Agentic Booking POC",
};

// `interactiveWidget: "resizes-content"`: where supported (Android Chrome
// 108+), the software keyboard shrinks the layout viewport itself, so the
// bottom-anchored composer layer rides above the keyboard natively. Browsers
// that ignore it (notably iOS Safari) are handled by `useVisualViewport`.
// Zoom is deliberately left enabled.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${nationalPark.variable} ${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/* suppressHydrationWarning: browser extensions (e.g. ColorZilla's
          cz-shortcut-listen) inject attributes onto <body> before React
          hydrates — a known false-positive source for this exact warning,
          not an app bug. Scoped to this one tag only; doesn't suppress any
          other hydration mismatch. */}
      <body
        className="min-h-full flex flex-col font-sans"
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
