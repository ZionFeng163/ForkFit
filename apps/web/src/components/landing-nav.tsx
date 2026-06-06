"use client";

import { useLocale, useTranslations } from "next-intl";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { Link } from "@/i18n/routing";

export function LandingNav() {
  const t = useTranslations("Nav");
  const locale = useLocale();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 border-b border-[#e4ded6] bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <img
            src={locale === "zh" ? "/logo_zh.png" : "/logo_en.png"}
            alt="吃什么"
            className="h-10 w-auto"
          />
        </Link>

        {/* Desktop links */}
        <div className="hidden items-center gap-6 md:flex">
          <Link href="/discover" className="text-sm font-medium text-[#5f5a52] hover:text-[#2f2a24] transition-colors">
            {t("discover")}
          </Link>
          <Link href="/login" className="text-sm font-medium text-[#5f5a52] hover:text-[#2f2a24] transition-colors">
            登录
          </Link>
          <Link
            href="/register"
            className="rounded-full bg-[#2f2a24] px-5 py-2 text-sm font-semibold text-white hover:bg-[#463f36] transition-colors"
          >
            注册
          </Link>
        </div>

        {/* Mobile menu button */}
        <button
          className="md:hidden"
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          {mobileOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="border-t border-[#e4ded6] bg-white px-4 py-4 md:hidden">
          <div className="flex flex-col gap-3">
            <Link href="/discover" className="text-sm font-medium text-[#5f5a52]" onClick={() => setMobileOpen(false)}>
              {t("discover")}
            </Link>
            <Link href="/login" className="text-sm font-medium text-[#5f5a52]" onClick={() => setMobileOpen(false)}>
              登录
            </Link>
            <Link href="/register" className="rounded-full bg-[#2f2a24] px-5 py-2 text-center text-sm font-semibold text-white" onClick={() => setMobileOpen(false)}>
              注册
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
