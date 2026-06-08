"use client";

import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/routing";
import { ScrollReveal } from "./scroll-reveal";

export function CTASection() {
  const t = useTranslations("Home");

  return (
    <section
      className="py-[100px] text-center relative overflow-hidden"
      style={{ background: "var(--lp-fg)", color: "white" }}
    >
      {/* Decorative gradient */}
      <div
        className="absolute pointer-events-none"
        style={{
          bottom: "-150px",
          left: "50%",
          transform: "translateX(-50%)",
          width: "500px",
          height: "500px",
          background: "radial-gradient(circle, rgba(232,93,58,0.15) 0%, transparent 70%)",
        }}
      />

      <div className="mx-auto max-w-[1200px] px-6 relative z-[1]">
        <ScrollReveal>
          <div className="text-[13px] font-semibold tracking-[0.08em] uppercase mb-3" style={{ color: "rgba(255,255,255,0.5)" }}>
            {t("ctaLabel")}
          </div>
          <div className="text-[clamp(28px,4vw,42px)] font-extrabold leading-[1.2] tracking-[-0.02em] max-w-[600px] mx-auto mb-4 text-white">
            {t("ctaTitle")}
          </div>
          <div className="text-[17px] leading-7 max-w-[560px] mx-auto mb-10" style={{ color: "rgba(255,255,255,0.6)" }}>
            {t("ctaDescription")}
          </div>
        </ScrollReveal>

        <ScrollReveal delay={200}>
          <div className="flex flex-wrap gap-3 justify-center relative z-[1]">
            <Link
              href="/register"
              className="inline-flex items-center gap-2 rounded-full px-9 py-4 text-[17px] font-bold transition-all duration-200 hover:-translate-y-0.5"
              style={{
                background: "white",
                color: "var(--lp-fg)",
                boxShadow: "0 4px 20px rgba(255,255,255,0.15)",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.9)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "white")}
            >
              {t("ctaButton")}
              <ArrowRight size={16} />
            </Link>
            <Link
              href="/discover"
              className="inline-flex items-center gap-2 rounded-full px-8 py-4 text-[17px] font-semibold text-white transition-all duration-200"
              style={{ border: "1.5px solid rgba(255,255,255,0.2)" }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.5)")}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.2)")}
            >
              {t("ctaSecondary")}
            </Link>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
