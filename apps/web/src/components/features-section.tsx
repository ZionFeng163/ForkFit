"use client";

import { useTranslations } from "next-intl";
import { Shield, Zap, Heart, Clock } from "lucide-react";

const features = [
  { icon: Shield, key: "feature1" },
  { icon: Zap, key: "feature2" },
  { icon: Heart, key: "feature3" },
  { icon: Clock, key: "feature4" },
];

export function FeaturesSection() {
  const t = useTranslations("Home");

  return (
    <section className="bg-white py-20 sm:py-24">
      <div className="mx-auto max-w-5xl px-6">
        <p className="text-center text-sm font-medium tracking-widest text-[#b8946e]">{t("featureTitle")}</p>
        <p className="mt-3 text-center text-2xl font-bold text-[#3a332c] sm:text-3xl">{t("featureSubtitle")}</p>

        <div className="mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <div key={f.key} className="flex flex-col items-center text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#faf6f0]">
                <f.icon size={26} className="text-[#8b7355]" />
              </div>
              <h3 className="mt-4 text-base font-semibold text-[#3a332c]">{t(`${f.key}Title`)}</h3>
              <p className="mt-2 text-sm leading-6 text-[#7a6e60]">{t(`${f.key}Desc`)}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
