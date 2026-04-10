import type { Metadata } from "next";
import "./globals.css";
import { Navbar } from "@/components/layout/Navbar";
import { Providers } from "@/components/Providers";

export const metadata: Metadata = {
  title: "Catalyst — Market Signal Dashboard",
  description:
    "AI-powered market catalyst discovery. Multi-source confluence pipeline with Gemini analysis, strategy routing, and conviction-scored trade recommendations.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <Providers>
          <Navbar />
          <main
            style={{
              maxWidth: 1400,
              margin: "0 auto",
              padding: "32px 24px 64px",
            }}
          >
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}
