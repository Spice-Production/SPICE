import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/next";
import OfflineShellRegistration from "./offline-shell-registration";
import { SPICE_UI_V2_BOOT_SCRIPT } from "./ui-v2/preference";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Spice — Premium Music Streaming",
  description: "The SPICE web and local music runtime for discovery, streaming, and playback.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Spice",
  },
};

export const viewport: Viewport = {
  themeColor: "#7c3aed",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <head>
        {/* Marks UI v2 preview testers before hydration so the classic shell does not flash. */}
        <script dangerouslySetInnerHTML={{ __html: SPICE_UI_V2_BOOT_SCRIPT }} />
      </head>
      <body>
        {children}
        <OfflineShellRegistration />
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  );
}
