"use client";

import { useTranslations } from "next-intl";
import { ScrollReveal } from "./scroll-reveal";

/* ---------- SVG icons ---------- */
function ShieldIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function ForkIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 3 21 3 21 8" />
      <line x1="4" y1="20" x2="21" y2="3" />
      <polyline points="21 16 21 21 16 21" />
      <line x1="15" y1="15" x2="21" y2="21" />
      <line x1="4" y1="4" x2="9" y2="9" />
    </svg>
  );
}

function BrainIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.5 2A5.5 5.5 0 0 0 5 12.5a5 5 0 0 0 1.5 3.5" />
      <path d="M14.5 2A5.5 5.5 0 0 1 19 12.5a5 5 0 0 1-1.5 3.5" />
      <path d="M12 2v20" />
    </svg>
  );
}

function TimerIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

const features = [
  { Icon: ShieldIcon, colorClass: "orange", colorVar: "--lp-accent-light", key: "feature1" },
  { Icon: ForkIcon, colorClass: "green", colorVar: "--lp-green-light", key: "feature2" },
  { Icon: BrainIcon, colorClass: "warm", colorVar: "--lp-warm-200", key: "feature3" },
  { Icon: TimerIcon, colorClass: "blue", colorVar: null, key: "feature4" },
];

export function FeaturesSection() {
  const t = useTranslations("Home");

  return (
    <section className="py-[100px]" style={{ background: "var(--lp-warm-100)" }}>
      <div className="mx-auto max-w-[1200px] px-6">
        <ScrollReveal>
          <div>
            <div className="text-[13px] font-semibold tracking-[0.08em] uppercase mb-3" style={{ color: "var(--lp-accent)" }}>
              {t("featureLabel")}
            </div>
            <div
              className="text-[clamp(28px,4vw,42px)] font-extrabold leading-[1.2] tracking-[-0.02em] mb-4"
              style={{ color: "var(--lp-fg)" }}
            >
              {t("featureTitle")}
            </div>
            <div className="text-[17px] leading-7 max-w-[560px]" style={{ color: "var(--lp-muted)" }}>
              {t("featureDesc")}
            </div>
          </div>
        </ScrollReveal>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-12">
          {features.map((f, i) => (
            <ScrollReveal key={f.key} delay={i * 100}>
              <div
                className="flex gap-5 rounded-2xl p-9 border transition-all duration-200 hover:-translate-y-0.5 h-full"
                style={{
                  background: "var(--lp-surface)",
                  borderColor: "var(--lp-border)",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "var(--lp-shadow-md)")}
                onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "none")}
              >
                <div
                  className="w-[52px] h-[52px] min-w-[52px] rounded-[14px] grid place-items-center"
                  style={{
                    background: f.colorVar ? `var(${f.colorVar})` : "#eef4fd",
                    color: "var(--lp-fg)",
                  }}
                >
                  <f.Icon />
                </div>
                <div>
                  <h3 className="text-[17px] font-bold mb-2" style={{ color: "var(--lp-fg)" }}>
                    {t(`${f.key}Title`)}
                  </h3>
                  <p className="text-sm leading-[1.65]" style={{ color: "var(--lp-muted)" }}>
                    {t(`${f.key}Desc`)}
                  </p>
                </div>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
