import { AppShell } from "@/components/layout/AppShell";
import { QueryProvider } from "@/components/providers/QueryProvider";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ReactNode } from "react";
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
  title: {
    default: "Apex F1 Live - Telemetry & Race Archive",
    template: "%s | Apex F1 Live",
  },
  description:
    "A live motorsport telemetry dashboard powered by FastF1, featuring race-day insights, speed traces, and historical archives.",
  metadataBase: new URL("https://f1-live-dashboard.vercel.app"),
  openGraph: {
    title: "Apex F1 Live",
    description:
      "Live telemetry, tyre strategy, and race archive insights for Formula 1 fans and strategists.",
    url: "https://f1-live-dashboard.vercel.app",
    siteName: "Apex F1 Live",
    type: "website",
    images: [
      {
        url: "/api/og",
        width: 1200,
        height: 630,
        alt: "Apex F1 Live telemetry dashboard",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Apex F1 Live",
    description:
      "Live telemetry, tyre strategy, and race archive insights for Formula 1 fans and strategists.",
    creator: "@apexf1live",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <QueryProvider>
          <AppShell>{children}</AppShell>
        </QueryProvider>
      </body>
    </html>
  );
}
