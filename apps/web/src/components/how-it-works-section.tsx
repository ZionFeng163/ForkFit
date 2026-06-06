"use client";

import { useTranslations } from "next-intl";
import { Search, Sparkles, ChefHat } from "lucide-react";

const steps = [
  { icon: Search, key: "howStep1" },
  { icon: Sparkles, key: "howStep2" },
  { icon: ChefHat, key: "howStep3" },
];

export function HowItWorksSection() {
  const t = useTranslations("Home");

  return (
    <section className="bg-gradient-to-b from-white to-[#faf6f0] py-20 sm:py-24">
      <div className="mx-auto max-w-5xl px-6">
        <p className="text-center text-sm font-medium tracking-widest text-[#b8946e]">{t("howTitle")}</p>
        <p className="mt-3 text-center text-2xl font-bold text-[#3a332c] sm:text-3xl">{t("howSubtitle")}</p>

        <div className="mt-14 grid gap-6 sm:grid-cols-3">
          {steps.map((s, i) => (
            <div key={s.key} className="flex flex-col items-center rounded-2xl border border-[#e8dfd6] bg-white p-8 text-center">
              <span className="text-xs font-bold text-[#b8946e]">0{i + 1}</span>
              <div className="mt-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#faf6f0]">
                <s.icon size={24} className="text-[#8b7355]" />
              </div>
              <h3 className="mt-4 text-base font-semibold text-[#3a332c]">{t(`${s.key}`)}</h3>
              <p className="mt-2 text-sm text-[#7a6e60]">{t(`${s.key}Desc`)}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
