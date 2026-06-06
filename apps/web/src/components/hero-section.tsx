"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ChefHat, Sparkles, ArrowRight } from "lucide-react";
import { Link } from "@/i18n/routing";

export function HeroSection() {
  const t = useTranslations("Home");
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-[#faf8f5] via-white to-[#f5f0ea] py-20 sm:py-28">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -right-40 -top-40 h-80 w-80 rounded-full bg-gradient-to-br from-[#e8dfd6] to-transparent opacity-60 blur-3xl"></div>
        <div className="absolute -bottom-40 -left-40 h-80 w-80 rounded-full bg-gradient-to-tr from-[#d4cfc8] to-transparent opacity-40 blur-3xl"></div>
      </div>

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex flex-col items-center text-center">
          {/* Logo/Icon */}
          <div
            className={`mb-8 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-[#2f2a24] to-[#5f5a52] shadow-lg transition-all duration-1000 ${
              isVisible ? "scale-100 opacity-100" : "scale-50 opacity-0"
            }`}
          >
            <ChefHat size={40} className="text-white" />
          </div>

          {/* Title */}
          <h1
            className={`text-4xl font-bold tracking-tight text-[#2f2a24] sm:text-5xl lg:text-6xl transition-all duration-1000 delay-200 ${
              isVisible ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
            }`}
          >
            {t("title")}
          </h1>

          {/* Subtitle */}
          <p
            className={`mt-6 max-w-2xl text-lg leading-8 text-[#6f6a61] sm:text-xl transition-all duration-1000 delay-400 ${
              isVisible ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
            }`}
          >
            {t("heroDescription")}
          </p>

          {/* CTA Buttons */}
          <div
            className={`mt-10 flex flex-col gap-4 sm:flex-row transition-all duration-1000 delay-600 ${
              isVisible ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
            }`}
          >
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-full bg-[#2f2a24] px-8 py-3 text-sm font-semibold text-white shadow-lg transition-all duration-300 hover:bg-[#463f36] hover:shadow-xl hover:-translate-y-0.5"
            >
              <Sparkles size={16} />
              {t("heroStep2")}
              <ArrowRight size={16} />
            </Link>
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-full border border-[#e4ded6] bg-white px-8 py-3 text-sm font-semibold text-[#2f2a24] shadow-sm transition-all duration-300 hover:bg-[#faf8f5] hover:shadow-md hover:-translate-y-0.5"
            >
              {t("heroStep1")}
            </Link>
          </div>

          {/* Steps */}
          <div
            className={`mt-16 flex flex-wrap justify-center gap-8 transition-all duration-1000 delay-800 ${
              isVisible ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
            }`}
          >
            {[
              { icon: "🍳", text: t("heroStep1") },
              { icon: "⚡", text: t("heroStep2") },
              { icon: "🍽️", text: t("heroStep3") },
            ].map((step, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-full bg-white/80 px-5 py-2.5 shadow-sm backdrop-blur-sm"
              >
                <span className="text-xl">{step.icon}</span>
                <span className="text-sm font-medium text-[#5f5a52]">{step.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
