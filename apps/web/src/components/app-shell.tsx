"use client";

import { useLocale, useTranslations } from "next-intl";

import { Link, usePathname } from "@/i18n/routing";

export function AppShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations("Nav");
  const language = useTranslations("Language");
  const locale = useLocale();
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-[#fafafa] text-[#1f1f1f]">
      <header className="border-b border-[#e7e2db] bg-white">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="text-[17px] font-semibold tracking-0">
            ForkFit
          </Link>
          <nav className="flex items-center gap-5 text-sm text-[#5f5a52]">
            <Link className="hover:text-[#1f1f1f]" href="/">
              {t("discover")}
            </Link>
            <Link className="hover:text-[#1f1f1f]" href="/posts/new">
              {t("newPost")}
            </Link>
            <Link className="hover:text-[#1f1f1f]" href="/profile">
              {t("profile")}
            </Link>
            <div
              aria-label={language("label")}
              className="flex items-center gap-2"
            >
              <Link
                href={pathname}
                locale="en"
                className={
                  locale === "en" ? "font-medium text-[#1f1f1f]" : "hover:text-[#1f1f1f]"
                }
              >
                EN
              </Link>
              <span className="text-[#c8bfb4]">/</span>
              <Link
                href={pathname}
                locale="zh"
                className={
                  locale === "zh" ? "font-medium text-[#1f1f1f]" : "hover:text-[#1f1f1f]"
                }
              >
                中文
              </Link>
            </div>
            <span className="hidden sm:inline">demo_user</span>
          </nav>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
