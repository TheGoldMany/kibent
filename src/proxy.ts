import { NextResponse, type NextRequest } from "next/server";
import { getAuth } from "@/lib/auth/server";

/**
 * Next.js 16 proxy (korábban middleware): a védett oldalakat a Neon Auth
 * session nélkül a /login-ra irányítja, és szükség esetén frissíti a sessiont.
 * A publikus útvonalakat (login, meghívó, iCal feed, auth API) a matcher kihagyja.
 */
export async function proxy(request: NextRequest) {
  const response = await getAuth().middleware({ loginUrl: "/login" })(request);
  // Visszatérési cél megőrzése a bejelentkezés után
  const location = response.headers.get("location");
  if (location && response.status >= 300 && response.status < 400) {
    const target = new URL(location, request.url);
    if (target.pathname === "/login" && request.nextUrl.pathname !== "/") {
      target.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
      return NextResponse.redirect(target, { headers: response.headers });
    }
  }
  return response;
}

export const config = {
  matcher: ["/", "/requests/:path*", "/settings/:path*", "/onboarding"],
};
