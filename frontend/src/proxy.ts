import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/** Auth (Clerk) deferred until after initial AWS deploy; allow all routes. */
export function proxy(_request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!.+\\.[\\w]+$|_next).*)",
    "/",
    "/(api|trpc)(.*)",
  ],
};
