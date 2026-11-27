import { NextRequest, NextResponse } from "next/server";

// Constant-time comparison (Edge runtime has no crypto.timingSafeEqual).
function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Meta must be able to reach this endpoint without dashboard auth (it is HMAC-verified instead).
  if (pathname.startsWith("/api/webhooks/whatsapp")) {
    return NextResponse.next();
  }

  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;

  if (!username || !password) {
    // Fail closed in production: never expose the dashboard without credentials.
    if (process.env.NODE_ENV === "production") {
      return new NextResponse("Dashboard locked: set ADMIN_USERNAME and ADMIN_PASSWORD environment variables.", {
        status: 503,
      });
    }
    // During local setup, don't lock the dashboard if credentials are missing.
    return NextResponse.next();
  }

  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Basic ")) {
    try {
      const decoded = atob(auth.slice(6));
      const separator = decoded.indexOf(":");
      const suppliedUser = decoded.slice(0, separator);
      const suppliedPass = decoded.slice(separator + 1);
      const userOk = safeEqual(suppliedUser, username);
      const passOk = safeEqual(suppliedPass, password);
      if (separator > -1 && userOk && passOk) {
        return NextResponse.next();
      }
    } catch {
      // fall through to challenge
    }
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="High Reach WhatsApp Manager"',
    },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logo.svg|fonts/).*)"],
};
