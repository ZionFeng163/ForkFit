"use client";

import { useTranslations } from "next-intl";
import { ScrollReveal } from "./scroll-reveal";

/* ---------- SVG icons for step visuals ---------- */
function DocumentIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--lp-accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--lp-accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 3 21 3 21 8" />
      <line x1="4" y1="20" x2="21" y2="3" />
      <polyline points="21 16 21 21 16 21" />
      <line x1="15" y1="15" x2="21" y2="21" />
      <line x1="4" y1="4" x2="9" y2="9" />
    </svg>
  );
}

function ChefHatIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--lp-accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 13.87A4 4 0 0 1 7.41 6a5.11 5.11 0 0 1 1.05-1.54 5 5 0 0 1 7.08 0A5.11 5.11 0 0 1 16.59 6 4 4 0 0 1 18 13.87V20H6z" />
      <line x1="6" y1="17" x2="18" y2="17" />
    </svg>
  );
}

const steps = [
  { Icon: DocumentIcon, key: "howStep1" },
  { Icon: CopyIcon, key: "howStep2" },
  { Icon: ChefHatIcon, key: "howStep3" },
];

export function HowItWorksSection() {
  const t = useTranslations("Home");

  return (
    <section className="py-[100px]" style={{ background: "var(--lp-bg)" }}>
      <div className="mx-auto max-w-[1200px] px-6">
        <ScrollReveal>
          <div className="text-center">
            <div className="text-[13px] font-semibold tracking-[0.08em] uppercase mb-3" style={{ color: "var(--lp-accent)" }}>
              {t("howLabel")}
            </div>
            <div
              className="text-[clamp(28px,4vw,42px)] font-extrabold leading-[1.2] tracking-[-0.02em] mb-4"
              style={{ color: "var(--lp-fg)" }}
            >
              {t("howTitle")}
            </div>
            <div className="text-[17px] leading-7 max-w-[560px] mx-auto" style={{ color: "var(--lp-muted)" }}>
              {t("howDesc")}
            </div>
          </div>
        </ScrollReveal>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-14 relative">
          {/* Connecting line (desktop only) */}
          <div
            className="hidden md:block absolute top-[40px] h-[2px]"
            style={{
              left: "calc(16.67% + 20px)",
              right: "calc(16.67% + 20px)",
              background: "var(--lp-border)",
            }}
          />

          {steps.map((s, i) => (
            <ScrollReveal key={s.key} delay={i * 150}>
              <div className="text-center relative">
                {/* Step number circle */}
                <div
                  className="w-14 h-14 rounded-full grid place-items-center text-xl font-extrabold text-white mx-auto mb-6 relative z-[1]"
                  style={{
                    background: "var(--lp-accent)",
                    boxShadow: "0 4px 16px rgba(232,93,58,0.2)",
                  }}
                >
                  {i + 1}
                </div>

                {/* Visual placeholder */}
                <div
                  className="w-full rounded-2xl grid place-items-center overflow-hidden border mb-5"
                  style={{
                    aspectRatio: "4/3",
                    background: "var(--lp-warm-100)",
                    borderColor: "var(--lp-border)",
                    opacity: 0.8,
                  }}
                >
                  <s.Icon />
                </div>

                <h3 className="text-lg font-bold mb-2" style={{ color: "var(--lp-fg)" }}>
                  {t(`${s.key}`)}
                </h3>
                <p className="text-sm leading-[1.65] max-w-[280px] mx-auto" style={{ color: "var(--lp-muted)" }}>
                  {t(`${s.key}Desc`)}
                </p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
