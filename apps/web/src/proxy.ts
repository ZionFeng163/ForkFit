import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";

import { routing } from "@/i18n/routing";
import { getSafeReturnTo } from "@/lib/auth-navigation";

const intlMiddleware = createMiddleware(routing);

function hasUnexpiredAccessToken(request: NextRequest): boolean {
  const token = request.cookies.get("access_token")?.value;
  if (!token) return false;

  try {
    const payload = token.split(".")[1];
    if (!payload) return false;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = JSON.parse(atob(normalized)) as { exp?: number };
    return typeof decoded.exp === "number" && decoded.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

export default function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === "/") {
    const destination = request.nextUrl.clone();
    destination.protocol = "http:";
    destination.pathname = `/${routing.defaultLocale}`;
    return NextResponse.rewrite(destination);
  }

  const authMatch = request.nextUrl.pathname.match(/^\/(en|zh)\/(?:login|register)\/?$/);
  if (authMatch && hasUnexpiredAccessToken(request)) {
    const returnTo = getSafeReturnTo(request.nextUrl.searchParams.get("returnTo"));
    return NextResponse.redirect(new URL(`/${authMatch[1]}${returnTo}`, request.url));
  }

  return intlMiddleware(request);
}

export const config = {
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
