"use client";

import { create } from "zustand";
import type { Strategy } from "@/types";

interface FilterState {
  strategy: Strategy | "all";
  dateRange: "7d" | "30d" | "90d" | "all";
  setStrategy: (s: Strategy | "all") => void;
  setDateRange: (d: "7d" | "30d" | "90d" | "all") => void;
}

export const useFilterStore = create<FilterState>((set) => ({
  strategy:  "all",
  dateRange: "30d",
  setStrategy:  (strategy)  => set({ strategy }),
  setDateRange: (dateRange) => set({ dateRange }),
}));
