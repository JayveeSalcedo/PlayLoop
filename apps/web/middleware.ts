import { jwtVerify } from "jose";
import { NextResponse, type NextRequest } from "next/server";

const COOKIE_NAME = "pl_session";
// Note: /c/[code] (the challenge landing page) is deliberately NOT protected
// here — it branches internally (getSession(), not requireSession()) so a
// logged-out visitor reaches the page itself and can play immediately as a
// guest, rather than middleware bouncing them to /login before they've even
// seen what they're being challenged to.
const PROTECTED = [
  "/feed",
  "/play",
  "/onboarding",
  "/wallet",
  "/rewards",
  "/challenges",
  "/create",
  "/community",
  "/events",
  "/admin",
  "/staff",
  "/brand",
];

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

  // Carry the page they were headed to along to /login so it can send them
  // back here once they're signed in, instead of dropping them on the
  // generic default landing page — see login/verify/actions.ts.
  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("redirect", pathname + req.nextUrl.search);
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
    "/community/:path*",
    "/events/:path*",
    "/admin/:path*",
    "/staff/:path*",
    "/brand/:path*",
  ],
};
