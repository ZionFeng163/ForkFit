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
    <nav className="sticky top-0 z-50 bg-[#faf6f0]/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-3">
          <img src="/logo_zh.png" alt="吃什么" className="h-10 w-auto" />
        </Link>

        <div className="hidden items-center gap-8 md:flex">
          <Link href="/discover" className="text-sm text-[#6b5e52] hover:text-[#3a332c] transition-colors">
            {t("discover")}
          </Link>
          <Link href="/login" className="text-sm text-[#6b5e52] hover:text-[#3a332c] transition-colors">
            {t("login")}
          </Link>
          <Link
            href="/register"
            className="rounded-full bg-[#3a332c] px-6 py-2.5 text-sm font-medium text-[#faf6f0] hover:bg-[#5a4f43] transition-all duration-300 hover:shadow-md"
          >
            {t("register")}
          </Link>
        </div>

        <button className="md:hidden text-[#3a332c]" onClick={() => setMobileOpen(!mobileOpen)}>
          {mobileOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {mobileOpen && (
        <div className="border-t border-[#e8dfd6] bg-white px-6 py-6 md:hidden">
          <div className="flex flex-col gap-4">
            <Link href="/discover" className="text-sm text-[#6b5e52]" onClick={() => setMobileOpen(false)}>
              {t("discover")}
            </Link>
            <Link href="/login" className="text-sm text-[#6b5e52]" onClick={() => setMobileOpen(false)}>
              {t("login")}
            </Link>
            <Link href="/register" className="rounded-full bg-[#3a332c] px-6 py-2.5 text-center text-sm font-medium text-[#faf6f0]" onClick={() => setMobileOpen(false)}>
              {t("register")}
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
