import type { Metadata } from "next";
import { PublicDashboard } from "@/components/public/PublicDashboard";

export const metadata: Metadata = {
  title: "Signals — Catalyst",
  description: "Daily snapshot of validated market signals, including catalyst, conviction, rationale, and confluence details.",
};

export default function Page() { return <PublicDashboard view="signals" />; }
