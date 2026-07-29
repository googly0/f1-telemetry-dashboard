import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "F1 Telemetry Predictor",
  description:
    "Cyberpunk pit-wall telemetry dashboard for F1 race predictions, 2015-2026.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/*
          Fonts are loaded via a standard <link> tag (runtime, in-browser) rather than
          next/font/google (build-time). This keeps `next build` fully offline-safe —
          useful for CI/CD environments or sandboxes with restricted egress — at the
          minor cost of next/font's automatic self-hosting/layout-shift optimizations.
          To switch back to next/font, see the note in README.md.
        */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500;600&family=Inter:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-obsidian-950 text-slate-100 font-body antialiased min-h-screen">
        <div className="fixed inset-0 bg-carbon-fiber pointer-events-none" />
        <div className="fixed inset-0 bg-grid-glow bg-grid pointer-events-none opacity-60" />
        <div className="relative z-10">{children}</div>
      </body>
    </html>
  );
}
