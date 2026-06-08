"use client";

import { useTranslations } from "next-intl";
import { ScrollReveal } from "./scroll-reveal";

/* ---------- SVG icons ---------- */
function ConfusedIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function ShieldOffIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <line x1="9" y1="9" x2="15" y2="15" />
      <line x1="15" y1="9" x2="9" y2="15" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

const problems = [
  { icon: ConfusedIcon, key: "problem1" },
  { icon: ShieldOffIcon, key: "problem2" },
  { icon: ClockIcon, key: "problem3" },
];

export function ProblemSection() {
  const t = useTranslations("Home");

  return (
    <section className="py-[100px]" style={{ background: "var(--lp-warm-100)" }}>
      <div className="mx-auto max-w-[1200px] px-6">
        <ScrollReveal>
          <div>
            <div className="text-[13px] font-semibold tracking-[0.08em] uppercase mb-3" style={{ color: "var(--lp-accent)" }}>
              {t("problemLabel")}
            </div>
            <div
              className="text-[clamp(28px,4vw,42px)] font-extrabold leading-[1.2] tracking-[-0.02em] mb-4"
              style={{ color: "var(--lp-fg)" }}
            >
              {t("problemTitle")}
            </div>
            <div className="text-[17px] leading-7 max-w-[560px]" style={{ color: "var(--lp-muted)" }}>
              {t("problemDesc")}
            </div>
          </div>
        </ScrollReveal>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
          {problems.map((p, i) => (
            <ScrollReveal key={p.key} delay={i * 100}>
              <div
                className="rounded-2xl p-8 border transition-all duration-200 hover:-translate-y-0.5 h-full"
                style={{
                  background: "var(--lp-surface)",
                  borderColor: "var(--lp-border)",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "var(--lp-shadow-md)")}
                onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "none")}
              >
                <div
                  className="w-12 h-12 rounded-xl grid place-items-center mb-5"
                  style={{ background: "var(--lp-warm-100)", color: "var(--lp-fg)" }}
                >
                  <p.icon />
                </div>
                <h3 className="text-[17px] font-bold mb-2.5" style={{ color: "var(--lp-fg)" }}>
                  {t(`${p.key}Title`)}
                </h3>
                <p className="text-sm leading-[1.65]" style={{ color: "var(--lp-muted)" }}>
                  {t(`${p.key}Desc`)}
                </p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
