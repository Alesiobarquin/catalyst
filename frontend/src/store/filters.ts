"use client";

import { create } from "zustand";
import type { Strategy } from "@/types";

interface FilterState {
  strategy: Strategy | "all";
  dateRange: "7d" | "30d" | "90d" | "all";
  status: string;
  ticker: string;
  setStrategy: (s: Strategy | "all") => void;
  setDateRange: (d: "7d" | "30d" | "90d" | "all") => void;
  setStatus: (s: string) => void;
  setTicker: (t: string) => void;
}

export const useFilterStore = create<FilterState>((set) => ({
  strategy: "all",
  dateRange: "30d",
  status: "all",
  ticker: "",
  setStrategy: (strategy) => set({ strategy }),
  setDateRange: (dateRange) => set({ dateRange }),
  setStatus: (status) => set({ status }),
  setTicker: (ticker) => set({ ticker }),
}));
