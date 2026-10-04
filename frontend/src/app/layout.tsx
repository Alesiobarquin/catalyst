import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Navbar } from "@/components/layout/Navbar";
import { Providers } from "@/components/Providers";

const inter = localFont({
  src: "./fonts/Inter.ttf",
  weight: "300 700",
  variable: "--font-sans",
  display: "swap",
});

const jetbrainsMono = localFont({
  src: "./fonts/JetBrainsMono.ttf",
  weight: "400 600",
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Catalyst — Signal Intelligence Platform",
  description:
    "Multi-factor confluence analysis. Quantitative signal generation with Gemini, Half-Kelly position sizing, and VIX regime filtering.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body>
        <Providers>
          <Navbar />
          <main
            style={{
              maxWidth: 1400,
              margin: "0 auto",
              padding: "28px 24px 48px",
            }}
          >
            {children}
          </main>
          <footer
            style={{
              borderTop: "1px solid rgba(255,255,255,0.06)",
              padding: "14px 24px",
              maxWidth: 1400,
              margin: "0 auto",
            }}
          >
            <p
              style={{
                fontSize: 11,
                color: "#475569",
                margin: 0,
                lineHeight: 1.6,
              }}
            >
              Signal intelligence provided for informational purposes only. Not investment advice.
              Past performance does not guarantee future results. All signals are algorithmically
              generated and may not reflect current market conditions. Trade at your own risk.
            </p>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
