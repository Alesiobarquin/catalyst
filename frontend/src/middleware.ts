import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/** Auth (Clerk) deferred until after initial AWS deploy; allow all routes. */
export function middleware(_request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!.+\\.[\\w]+$|_next).*)",
    "/",
    "/(api|trpc)(.*)",
  ],
};
