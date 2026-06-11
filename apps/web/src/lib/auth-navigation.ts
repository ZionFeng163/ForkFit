import { routing } from "@/i18n/routing";

type BrowserLocation = Pick<Location, "pathname" | "search" | "hash">;

const localePattern = new RegExp(
  `^/(${routing.locales.join("|")})(?=/|$)`,
);

export function stripLocalePrefix(pathname: string): string {
  const normalized = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const withoutLocale = normalized.replace(localePattern, "");
  return withoutLocale || "/";
}

export function getLocaleFromPathname(pathname: string): string | null {
  return pathname.match(localePattern)?.[1] ?? null;
}

export function getCurrentReturnTo(location: BrowserLocation): string {
  return `${stripLocalePrefix(location.pathname)}${location.search}${location.hash}`;
}

export function getSafeReturnTo(
  value: string | null,
  fallback = "/discover",
): string {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\")
  ) {
    return fallback;
  }

  try {
    const parsed = new URL(value, "http://forkfit.local");
    const pathname = stripLocalePrefix(parsed.pathname);

    if (pathname === "/login" || pathname === "/register") {
      return fallback;
    }

    return `${pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

export function getLoginHref(location: BrowserLocation): string {
  const returnTo = getCurrentReturnTo(location);
  return `/login?returnTo=${encodeURIComponent(returnTo)}`;
}

export function getLocalizedLoginUrl(
  location: BrowserLocation,
  includeReturnTo = true,
): string {
  const locale = getLocaleFromPathname(location.pathname);
  const loginPath = locale ? `/${locale}/login` : "/login";

  if (!includeReturnTo) {
    return loginPath;
  }

  const returnTo = getCurrentReturnTo(location);
  return `${loginPath}?returnTo=${encodeURIComponent(returnTo)}`;
}
