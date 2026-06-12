"use client";

import { useLocale, useTranslations } from "next-intl";
import { FileText, GitFork, Home, LogOut, Plus, Shield, User } from "lucide-react";

import { useAuth } from "@/components/auth-provider";
import { Link, usePathname } from "@/i18n/routing";

const NAV_ITEMS = [
  { key: "discover", href: "/discover", icon: Home },
  { key: "newPost", href: "/posts/new", icon: Plus },
  { key: "myPosts", href: "/my-posts", icon: FileText },
  { key: "myForks", href: "/my-forks", icon: GitFork },
  { key: "profile", href: "/profile", icon: User },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations("Nav");
  const locale = useLocale();
  const pathname = usePathname();
  const { user, logout } = useAuth();

  return (
    <div className="flex min-h-screen" style={{ background: "var(--lp-warm-100)", color: "var(--lp-fg)" }}>
      {/* Desktop sidebar */}
      <aside
        className="hidden md:flex h-screen sticky top-0 w-60 shrink-0 flex-col"
        style={{
          background: "var(--lp-surface)",
          borderRight: "1px solid var(--lp-border)",
        }}
      >
        {/* Logo */}
        <div className="px-5 pt-6 pb-5">
          <Link href="/" className="flex items-center gap-2.5">
            <img
              src={locale === "zh" ? "/logo_zh.png" : "/logo_en.png"}
              alt={locale === "zh" ? "吃什么" : "ForkFit"}
              className="h-12 w-auto"
            />
          </Link>
        </div>

        {/* Nav links */}
        <nav className="flex-1 px-3">
          {NAV_ITEMS.map(({ key, href, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={key}
                href={href}
                className="sidebar-nav-link"
                style={{
                  background: active ? "var(--lp-accent-light)" : undefined,
                  color: active ? "var(--lp-accent)" : undefined,
                  fontWeight: active ? 600 : undefined,
                }}
              >
                <Icon size={18} />
                {t(key)}
              </Link>
            );
          })}
          {user?.role === "admin" && (
            <Link
              href="/admin"
              className="sidebar-nav-link"
              style={{
                background: pathname.startsWith("/admin") ? "var(--lp-accent-light)" : undefined,
                color: pathname.startsWith("/admin") ? "var(--lp-accent)" : undefined,
                fontWeight: pathname.startsWith("/admin") ? 600 : undefined,
              }}
            >
              <Shield size={18} />
              {t("admin")}
            </Link>
          )}
        </nav>

        {/* User section */}
        <div className="px-3 py-4" style={{ borderTop: "1px solid var(--lp-border)" }}>
          {user ? (
            <div className="flex items-center gap-2.5 px-3">
              <Link href="/profile" className="flex items-center gap-2.5 flex-1 min-w-0 rounded-lg transition-colors hover:bg-[var(--lp-warm-100)] px-2 py-1 -ml-2">
                <div
                  className="w-8 h-8 rounded-full grid place-items-center text-[13px] font-bold flex-shrink-0"
                  style={{ background: "var(--lp-accent-soft)", color: "var(--lp-accent)" }}
                >
                  {user.avatar_url ? (
                    <img src={user.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                  ) : (
                    (user.display_name || user.username || "?")[0].toUpperCase()
                  )}
                </div>
                <span
                  className="min-w-0 flex-1 truncate text-[13px]"
                  style={{ color: "var(--lp-muted)" }}
                >
                  {user.display_name || user.username}
                </span>
              </Link>
              <button
                onClick={logout}
                className="shrink-0 p-1 rounded transition-colors"
                style={{ color: "var(--lp-muted)" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "var(--lp-fg)")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "var(--lp-muted)")}
                title="退出"
              >
                <LogOut size={14} />
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              className="block px-3 py-2 text-xs font-medium"
              style={{ color: "var(--lp-muted)" }}
            >
              登录 / Login
            </Link>
          )}
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col">
        {/* Topbar */}
        <header
          className="flex items-center justify-end px-6"
          style={{
            height: "52px",
            background: "var(--lp-warm-100)",
            borderBottom: "1px solid var(--lp-border)",
          }}
        >
          <div className="flex items-center gap-1.5">
            <Link
              href={pathname}
              locale="en"
              className="px-2 py-0.5 rounded text-xs transition-colors"
              style={{
                fontWeight: locale === "en" ? 600 : 400,
                color: locale === "en" ? "var(--lp-fg)" : "var(--lp-muted)",
              }}
            >
              EN
            </Link>
            <span className="text-xs" style={{ color: "var(--lp-border)" }}>/</span>
            <Link
              href={pathname}
              locale="zh"
              className="px-2 py-0.5 rounded text-xs transition-colors"
              style={{
                fontWeight: locale === "zh" ? 600 : 400,
                color: locale === "zh" ? "var(--lp-fg)" : "var(--lp-muted)",
              }}
            >
              中文
            </Link>
          </div>
        </header>

        <main className="flex-1 pb-20 md:pb-0">{children}</main>
      </div>

      {/* Mobile bottom tabs */}
      <nav
        className="fixed bottom-0 left-0 right-0 flex md:hidden z-50"
        style={{
          background: "var(--lp-surface)",
          borderTop: "1px solid var(--lp-border)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        {NAV_ITEMS.map(({ key, href, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={key}
              href={href}
              className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px]"
              style={{ color: active ? "var(--lp-accent)" : "var(--lp-muted)" }}
            >
              <Icon size={20} />
              {t(key)}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
