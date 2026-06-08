"use client";

import { useLocale, useTranslations } from "next-intl";
import { Menu, X } from "lucide-react";
import { useState, useEffect } from "react";
import { Link } from "@/i18n/routing";

export function LandingNav() {
  const t = useTranslations("Nav");
  const tHome = useTranslations("Home");
  const locale = useLocale();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const logoSrc = locale === "en" ? "/logo_en.png" : "/logo_zh.png";
  const logoAlt = locale === "en" ? "ForkFit" : "吃什么";

  return (
    <>
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-shadow duration-300 ${
          scrolled ? "shadow-[var(--lp-shadow-sm)]" : ""
        }`}
        style={{
          background: "rgba(255,253,249,0.85)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderBottom: "1px solid var(--lp-border)",
        }}
      >
        <div className="mx-auto flex max-w-[1200px] items-center justify-between px-6 h-16">
          <Link href="/" className="flex items-center gap-2.5 font-bold text-[18px]" style={{ color: "var(--lp-fg)" }}>
            <div className="w-8 h-8 rounded-lg overflow-hidden flex-shrink-0">
              <img src={logoSrc} alt={logoAlt} className="w-full h-full object-cover" />
            </div>
            {locale === "en" ? "ForkFit" : "吃什么"}
          </Link>

          <div className="hidden items-center gap-8 md:flex">
            <a href="#how" className="text-sm font-medium transition-colors hover:text-[var(--lp-fg)]" style={{ color: "var(--lp-muted)" }}>
              {t("howItWorks")}
            </a>
            <a href="#features" className="text-sm font-medium transition-colors hover:text-[var(--lp-fg)]" style={{ color: "var(--lp-muted)" }}>
              {t("features")}
            </a>
            <a href="#showcase" className="text-sm font-medium transition-colors hover:text-[var(--lp-fg)]" style={{ color: "var(--lp-muted)" }}>
              {t("showcase")}
            </a>
            <Link
              href="/register"
              className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold text-white transition-all duration-200 hover:-translate-y-px"
              style={{ background: "var(--lp-accent)" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--lp-accent-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "var(--lp-accent)")}
            >
              {t("register")} →
            </Link>
          </div>

          <button
            className="md:hidden w-10 h-10 grid place-items-center"
            style={{ color: "var(--lp-fg)" }}
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="菜单"
          >
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </nav>

      {/* Mobile menu */}
      {mobileOpen && (
        <div
          className="fixed top-16 left-0 right-0 bottom-0 z-[99] flex flex-col gap-2 p-8 md:hidden"
          style={{ background: "var(--lp-bg)" }}
        >
          <a href="#how" className="block py-3.5 text-base font-medium border-b" style={{ color: "var(--lp-fg)", borderColor: "var(--lp-border)" }} onClick={() => setMobileOpen(false)}>
            {t("howItWorks")}
          </a>
          <a href="#features" className="block py-3.5 text-base font-medium border-b" style={{ color: "var(--lp-fg)", borderColor: "var(--lp-border)" }} onClick={() => setMobileOpen(false)}>
            {t("features")}
          </a>
          <a href="#showcase" className="block py-3.5 text-base font-medium border-b" style={{ color: "var(--lp-fg)", borderColor: "var(--lp-border)" }} onClick={() => setMobileOpen(false)}>
            {t("showcase")}
          </a>
          <Link href="/register" className="block py-3.5 text-base font-medium border-b" style={{ color: "var(--lp-fg)", borderColor: "var(--lp-border)" }} onClick={() => setMobileOpen(false)}>
            {t("register")}
          </Link>
        </div>
      )}
    </>
  );
}
