"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Sparkles, ArrowRight } from "lucide-react";
import { Link } from "@/i18n/routing";

export function HeroSection() {
  const t = useTranslations("Home");
  const [visible, setVisible] = useState(false);

  useEffect(() => { setVisible(true); }, []);

  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-[#faf6f0] to-[#f5f0ea] pt-24 pb-8 sm:pt-32 sm:pb-12">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-20 right-1/4 h-64 w-64 rounded-full bg-[#e8dfd6] opacity-30 blur-3xl"></div>
        <div className="absolute bottom-10 left-1/4 h-48 w-48 rounded-full bg-[#d4cfc8] opacity-20 blur-3xl"></div>
      </div>

      <div className="relative mx-auto max-w-4xl px-6 text-center">
        <p className={`text-sm font-medium tracking-widest text-[#b8946e] transition-all duration-700 ${visible ? "opacity-100" : "opacity-0 -translate-y-4"}`}>
          AI 个性化菜谱定制
        </p>

        <h1 className={`mt-6 text-4xl font-bold tracking-tight text-[#3a332c] sm:text-5xl lg:text-6xl transition-all duration-700 delay-150 ${visible ? "opacity-100" : "opacity-0 -translate-y-4"}`}>
          社区菜谱
          <br />
          <span className="text-[#8b7355]">一键适配你的口味</span>
        </h1>

        <p className={`mx-auto mt-6 max-w-xl text-base leading-7 text-[#7a6e60] transition-all duration-700 delay-300 ${visible ? "opacity-100" : "opacity-0 -translate-y-4"}`}>
          {t("heroDescription")}
        </p>

        {/* CTA Buttons — matching LitVoice style */}
        <div className={`mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center transition-all duration-700 delay-450 ${visible ? "opacity-100" : "opacity-0 translate-y-4"}`}>
          <Link
            href="/discover"
            className="inline-flex items-center gap-2 rounded-lg bg-[#8b6b4f] px-7 py-3 text-sm font-semibold text-white transition-all duration-200 hover:bg-[#7a5c42]"
          >
            {t("ctaButton")}
            <ArrowRight size={15} />
          </Link>
          <Link
            href="/profile"
            className="inline-flex items-center gap-2 rounded-lg border border-[#c8b89a] bg-white px-7 py-3 text-sm font-semibold text-[#5a4a3a] transition-all duration-200 hover:bg-[#f5f0ea]"
          >
            {t("ctaSecondary")}
          </Link>
        </div>
      </div>
    </section>
  );
}
