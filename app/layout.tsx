import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Shiori 栞 — Spoiler-Safe Anime Companion",
  description:
    "Ask anything about the anime you're watching, bounded by the episode you're on. Never get spoiled.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
