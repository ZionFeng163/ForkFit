"use client";

import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/routing";

export function CTASection() {
  const t = useTranslations("Home");

  return (
    <section className="bg-[#faf6f0] py-20 sm:py-24">
      <div className="mx-auto max-w-4xl px-6 text-center">
        <p className="text-sm font-medium tracking-widest text-[#b8946e]">{t("ctaTitle")}</p>
        <p className="mt-3 text-lg text-[#7a6e60]">{t("ctaDescription")}</p>
        <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <Link
            href="/discover"
            className="inline-flex items-center gap-2 rounded-full bg-[#8b6b4f] px-8 py-3.5 text-sm font-semibold text-white shadow-sm hover:bg-[#7a5c42] transition-all duration-300 hover:-translate-y-0.5"
          >
            {t("ctaButton")}
            <ArrowRight size={16} />
          </Link>
          <Link
            href="/profile"
            className="inline-flex items-center gap-2 rounded-full border border-[#b89a7a] bg-white px-8 py-3 text-sm font-semibold text-[#5a4a3a] hover:bg-[#f5f0ea] transition-all duration-300 hover:-translate-y-0.5"
          >
            {t("ctaSecondary")}
          </Link>
        </div>
      </div>
    </section>
  );
}
