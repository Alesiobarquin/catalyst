import type { Metadata } from "next";
import { PublicDashboard } from "@/components/public/PublicDashboard";

export const metadata: Metadata = {
  title: "Dashboard — Catalyst",
  description: "Daily snapshot of Catalyst's modeled market recommendations, scan status, and market benchmarks.",
};

export default function Page() { return <PublicDashboard view="orders" />; }
