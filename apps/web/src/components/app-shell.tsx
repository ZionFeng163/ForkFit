"use client";

import { useLocale, useTranslations } from "next-intl";
import { FileText, Home, LogOut, Plus, User } from "lucide-react";

import { useAuth } from "@/components/auth-provider";
import { Link, usePathname } from "@/i18n/routing";

const NAV_ITEMS = [
  { key: "discover", href: "/", icon: Home },
  { key: "newPost", href: "/posts/new", icon: Plus },
  { key: "myPosts", href: "/my-posts", icon: FileText },
  { key: "profile", href: "/profile", icon: User },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations("Nav");
  const locale = useLocale();
  const pathname = usePathname();
  const { user, logout } = useAuth();

  return (
    <div className="flex min-h-screen bg-[#fafafa] text-[#1f1f1f]">
      {/* Desktop sidebar — fixed to viewport height */}
      <aside className="hidden md:flex h-screen sticky top-0 w-60 shrink-0 flex-col border-r border-[#e7e2db] bg-white">
        <div className="px-5 pt-6 pb-4">
          <Link href="/" className="block">
            <img
              src={locale === "zh" ? "/logo_zh.png" : "/logo_en.png"}
              alt={locale === "zh" ? "吃什么" : "ForkFit"}
              className="h-16 w-auto"
            />
          </Link>
        </div>

        <nav className="flex-1 px-3">
          {NAV_ITEMS.map(({ key, href, icon: Icon }) => {
            const active = pathname === href || (href !== "/" && pathname.startsWith(href));
            return (
              <Link
                key={key}
                href={href}
                className={`mb-1 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                  active
                    ? "bg-[#f5f0ea] font-medium text-[#1f1f1f]"
                    : "text-[#5f5a52] hover:bg-[#f9f6f2] hover:text-[#1f1f1f]"
                }`}
              >
                <Icon size={18} />
                {t(key)}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-[#e7e2db] px-3 py-4">
          {user ? (
            <div className="flex items-center gap-2 px-3">
              {user.avatar_url ? (
                <img src={user.avatar_url} alt="" className="h-7 w-7 rounded-full object-cover" />
              ) : (
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#e4ded6] text-xs font-medium text-[#6f6a61]">
                  {(user.display_name || user.username || "?")[0].toUpperCase()}
                </div>
              )}
              <span className="min-w-0 flex-1 truncate text-xs text-[#5f5a52]">
                {user.display_name || user.username}
              </span>
              <button
                onClick={logout}
                className="shrink-0 rounded p-1 text-[#9f9890] hover:bg-[#f5f0ea] hover:text-[#5f5a52]"
                title="Logout"
              >
                <LogOut size={14} />
              </button>
            </div>
          ) : (
            <Link href="/login" className="block px-3 py-2 text-xs text-[#5f5a52] hover:text-[#1f1f1f]">
              登录 / Login
            </Link>
          )}
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col">
        {/* Top bar — language switcher on the right */}
        <header className="flex items-center justify-end border-b border-[#e7e2db] bg-white px-4 py-2 md:px-6">
          <div className="flex items-center gap-2">
            <Link
              href={pathname}
              locale="en"
              className={`text-xs ${locale === "en" ? "font-medium text-[#1f1f1f]" : "text-[#9f9890] hover:text-[#5f5a52]"}`}
            >
              EN
            </Link>
            <span className="text-xs text-[#d0c9c0]">/</span>
            <Link
              href={pathname}
              locale="zh"
              className={`text-xs ${locale === "zh" ? "font-medium text-[#1f1f1f]" : "text-[#9f9890] hover:text-[#5f5a52]"}`}
            >
              中文
            </Link>
          </div>
        </header>
        <main className="flex-1 pb-20 md:pb-0">{children}</main>
      </div>

      {/* Mobile bottom tab bar */}
      <nav className="fixed bottom-0 left-0 right-0 flex border-t border-[#e7e2db] bg-white md:hidden">
        {NAV_ITEMS.map(({ key, href, icon: Icon }) => {
          const active = pathname === href || (href !== "/" && pathname.startsWith(href));
          return (
            <Link
              key={key}
              href={href}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] ${
                active ? "text-[#1f1f1f]" : "text-[#9f9890]"
              }`}
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
