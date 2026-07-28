import type { Metadata, Viewport } from "next";

import { QueryProvider } from "@/components/query-provider";

import "./globals.css";

export const metadata: Metadata = {
  title: "Golfbestilling",
  description: "Bestill mat og drikke til der du er pa golfbanen.",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#23713e",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nb">
      <body className="min-h-full antialiased">
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
