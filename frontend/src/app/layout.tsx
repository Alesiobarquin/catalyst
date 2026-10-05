import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Navbar } from "@/components/layout/Navbar";
import { Providers } from "@/components/Providers";
import { THEME_BOOTSTRAP_SCRIPT } from "@/lib/theme-config";

const inter = localFont({
  src: "./fonts/Inter.ttf",
  weight: "300 700",
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = localFont({
  src: "./fonts/JetBrainsMono.ttf",
  weight: "400 600",
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Catalyst — Signal Intelligence Platform",
  description:
    "Multi-factor confluence analysis. Quantitative signal generation with Gemini, Half-Kelly position sizing, and VIX regime filtering.",
  icons: { icon: "/icon.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-theme="light"
      suppressHydrationWarning
      className={`${inter.variable} ${jetbrainsMono.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
      </head>
      <body>
        <Providers>
          <Navbar />
          <main className="site-main">
            {children}
          </main>
          <footer className="site-footer">
            <p>
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
