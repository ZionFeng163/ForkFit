"use client";

import { FormEvent, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CalendarDays, FilePlus2, Home, Search, Shield, User } from "lucide-react";

import { useAuth } from "@/components/auth-provider";
import { BrandLogo } from "@/components/brand-logo";
import { MealPlanBasket } from "@/components/meal-plan-basket";
import { Link, usePathname, useRouter } from "@/i18n/routing";

const MOBILE_NAV = [
  { key: "home", href: "/", icon: Home },
  { key: "discover", href: "/discover", icon: Search },
  { key: "mealPlan", href: "/meal-plans", icon: CalendarDays },
  { key: "newPost", href: "/posts/new", icon: FilePlus2 },
  { key: "profile", href: "/profile", icon: User },
] as const;

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations("Nav");
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading } = useAuth();
  const [search, setSearch] = useState("");

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    const query = search.trim();
    router.push(query ? `/discover?q=${encodeURIComponent(query)}` : "/discover");
  }

  return (
    <div className="min-h-screen bg-[var(--canvas)] text-[var(--on-surface)]">
      <header className="site-header">
        <div className="site-container site-header-inner">
          <BrandLogo />

          <nav className="site-nav" aria-label={locale === "zh" ? "主导航" : "Primary navigation"}>
            <Link href="/" className="site-nav-link" data-active={pathname === "/"}>
              {locale === "zh" ? "首页" : "Home"}
            </Link>
            <Link href="/discover" className="site-nav-link" data-active={isActive(pathname, "/discover") || isActive(pathname, "/packs")}>
              {t("discover")}
            </Link>
            <Link href="/meal-plans" className="site-nav-link" data-active={isActive(pathname, "/meal-plans")}>
              {locale === "zh" ? "吃饭计划" : "Meal plans"}
            </Link>
            <Link href="/posts/new" className="site-nav-link" data-active={isActive(pathname, "/posts/new")}>
              {t("newPost")}
            </Link>
          </nav>

          <form className="header-search" onSubmit={submitSearch} role="search">
            <Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-text)]" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={locale === "zh" ? "搜索菜谱" : "Search recipes"}
              aria-label={locale === "zh" ? "搜索菜谱" : "Search recipes"}
            />
          </form>

          <div className="header-actions flex items-center gap-1">
            <Link href={pathname} locale={locale === "zh" ? "en" : "zh"} className="button-quiet min-h-10 px-3 text-xs">
              {locale === "zh" ? "EN" : "中文"}
            </Link>
            {user?.role === "admin" && (
              <Link href="/admin" className="button-quiet min-h-10 px-3" title={t("admin")}>
                <Shield size={17} />
              </Link>
            )}
            {user ? (
              <>
                <Link href="/profile" className="ml-1 flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-[var(--primary-container)] text-sm font-bold text-[var(--on-primary-container)]" aria-label={locale === "zh" ? "个人中心" : "Profile"}>
                  {user.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={user.avatar_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    (user.display_name || user.username || "?")[0].toUpperCase()
                  )}
                </Link>
              </>
            ) : loading ? (
              <span className="h-10 w-20" aria-hidden="true" />
            ) : (
              <>
                <Link href="/login" className="button-quiet desktop-only">{t("login")}</Link>
                <Link href="/register" className="button-primary">{t("register")}</Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="app-main">{children}</main>
      <MealPlanBasket />

      <nav className="mobile-bottom-nav" aria-label={locale === "zh" ? "移动导航" : "Mobile navigation"}>
        {MOBILE_NAV.map(({ key, href, icon: Icon }) => (
          <Link key={key} href={href} data-active={key === "home" ? pathname === "/" : isActive(pathname, href)} aria-current={(key === "home" ? pathname === "/" : isActive(pathname, href)) ? "page" : undefined}>
            <Icon size={18} />
            {key === "home"
              ? (locale === "zh" ? "首页" : "Home")
              : key === "discover"
                ? t("discover")
                : key === "mealPlan"
                  ? (locale === "zh" ? "计划" : "Plan")
                  : t(key)}
          </Link>
        ))}
      </nav>
    </div>
  );
}
