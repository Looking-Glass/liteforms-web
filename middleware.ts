import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getAuth0Client, hasAuth0Config } from "./lib/auth0";

export async function middleware(request: NextRequest) {
  if (!hasAuth0Config()) {
    if (request.nextUrl.pathname.startsWith("/auth/")) {
      return NextResponse.json(
        { error: "Auth0 is not configured. Set AUTH0_DOMAIN, AUTH0_CLIENT_ID, AUTH0_CLIENT_SECRET, and AUTH0_SECRET." },
        { status: 503 }
      );
    }

    return NextResponse.next();
  }

  const auth0 = await getAuth0Client();

  if (!auth0) {
    return NextResponse.next();
  }

  return auth0.middleware(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)"]
};
