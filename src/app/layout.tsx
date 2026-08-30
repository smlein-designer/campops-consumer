import type { Metadata } from "next";
import { Caprasimo, Geist_Mono, Public_Sans } from "next/font/google";
import "./globals.css";

// Handoff Spec 1.3 Typography — Display/Heading styles use Caprasimo,
// Body/Label/Caption styles use Public Sans.
const caprasimo = Caprasimo({
  variable: "--font-caprasimo",
  weight: "400",
  subsets: ["latin"],
});

const publicSans = Public_Sans({
  variable: "--font-public-sans",
  weight: ["400", "500", "600"],
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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${caprasimo.variable} ${publicSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
