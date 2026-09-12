import { jwtVerify } from "jose";
import { NextResponse, type NextRequest } from "next/server";

const COOKIE_NAME = "pl_session";
// Note: /c/[code] (the challenge landing page) is deliberately NOT protected
// here — it branches internally (getSession(), not requireSession()) so a
// logged-out visitor reaches the page and gets redirected to /login with the
// challenge code preserved, rather than middleware dropping it beforehand.
const PROTECTED = ["/feed", "/play", "/onboarding", "/wallet", "/rewards", "/challenges", "/create", "/admin", "/staff", "/brand"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!PROTECTED.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (token) {
    try {
      await jwtVerify(token, new TextEncoder().encode(process.env.SESSION_SECRET));
      return NextResponse.next();
    } catch {
      // fall through to redirect
    }
  }

  const loginUrl = new URL("/login", req.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/feed/:path*",
    "/play/:path*",
    "/onboarding/:path*",
    "/wallet/:path*",
    "/rewards/:path*",
    "/challenges/:path*",
    "/create/:path*",
    "/admin/:path*",
    "/staff/:path*",
    "/brand/:path*",
  ],
};
