import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/**
 * Next.js 16 proxy: munkamenet-süti nélkül a védett oldalak a /login-ra irányítanak.
 * Ez csak gyors előszűrés – a tényleges jogosultságot minden oldal a szerveren ellenőrzi.
 */
export function proxy(request: NextRequest) {
  if (getSessionCookie(request)) return NextResponse.next();
  const url = new URL("/login", request.url);
  const { pathname, search } = request.nextUrl;
  if (pathname !== "/") url.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/", "/requests/:path*", "/settings/:path*", "/onboarding"],
};
