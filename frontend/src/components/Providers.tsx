"use client";

import type { ReactNode } from "react";

/** Clerk deferred; wrap children only. Re-enable ClerkProvider when auth ships. */
export function Providers({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
