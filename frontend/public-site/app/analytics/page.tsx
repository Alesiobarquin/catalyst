import type { Metadata } from "next";
import { PublicDashboard } from "@/components/public/PublicDashboard";

export const metadata: Metadata = {
  title: "Analytics — Catalyst",
  description: "Daily snapshot analytics for recommendation history and modeled outcomes based on sampled stop and target prices.",
};

export default function Page() { return <PublicDashboard view="analytics" />; }
