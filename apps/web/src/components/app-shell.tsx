"use client";

import { FormEvent, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Bookmark, FilePlus2, Home, Search, Shield, Sparkles, User } from "lucide-react";

import { useAuth } from "@/components/auth-provider";
import { BrandLogo } from "@/components/brand-logo";
import { Link, usePathname, useRouter } from "@/i18n/routing";

const MOBILE_NAV = [
  { key: "discover", href: "/discover", icon: Home },
  { key: "newPost", href: "/posts/new", icon: FilePlus2 },
  { key: "myForks", href: "/my-forks", icon: Sparkles },
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
    <div className="min-h-screen bg-[var(--canvas)] text-[var(--text)]">
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

          <div className="header-actions flex items-center gap-1.5">
            <Link href={pathname} locale={locale === "zh" ? "en" : "zh"} className="button-quiet h-9 min-h-9 px-2.5 text-xs">
              {locale === "zh" ? "EN" : "中文"}
            </Link>
            {user?.role === "admin" && (
              <Link href="/admin" className="button-quiet h-9 min-h-9 px-2.5" title={t("admin")}>
                <Shield size={17} />
              </Link>
            )}
            {user ? (
              <>
                <Link href="/profile" className="button-quiet desktop-only h-9 min-h-9 px-2.5" title={locale === "zh" ? "我的收藏" : "Saved"}>
                  <Bookmark size={17} />
                </Link>
                <Link href="/profile" className="ml-1 flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-[var(--brand-soft)] text-sm font-bold text-[var(--brand-hover)]" aria-label={locale === "zh" ? "个人中心" : "Profile"}>
                  {user.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={user.avatar_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    (user.display_name || user.username || "?")[0].toUpperCase()
                  )}
                </Link>
              </>
            ) : loading ? (
              <span className="h-9 w-20" aria-hidden="true" />
            ) : (
              <>
                <Link href="/login" className="button-quiet desktop-only h-9 min-h-9">{t("login")}</Link>
                <Link href="/register" className="button-primary h-9 min-h-9 px-3.5">{t("register")}</Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="app-main">{children}</main>

      <nav className="mobile-bottom-nav" aria-label={locale === "zh" ? "移动导航" : "Mobile navigation"}>
        {MOBILE_NAV.map(({ key, href, icon: Icon }) => (
          <Link key={key} href={href} data-active={isActive(pathname, href)}>
            <Icon size={18} />
            {t(key)}
          </Link>
        ))}
      </nav>
    </div>
  );
}
