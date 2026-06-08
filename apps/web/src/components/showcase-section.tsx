"use client";

import { useTranslations } from "next-intl";
import { ScrollReveal } from "./scroll-reveal";

/* ---------- SVG illustration for phone ---------- */
function CurryIllustration() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
      <ellipse cx="32" cy="38" rx="22" ry="14" fill="#e85d3a" opacity="0.12" />
      <ellipse cx="32" cy="34" rx="20" ry="12" fill="#f5a623" opacity="0.18" />
      <circle cx="24" cy="30" r="4" fill="#2d8a56" opacity="0.3" />
      <circle cx="36" cy="28" r="3" fill="#e85d3a" opacity="0.25" />
      <circle cx="30" cy="34" r="3.5" fill="#d4a054" opacity="0.3" />
    </svg>
  );
}

const steps = [
  { key: "showcaseStep1" },
  { key: "showcaseStep2" },
  { key: "showcaseStep3" },
  { key: "showcaseStep4" },
];

export function ShowcaseSection() {
  const t = useTranslations("Home");

  return (
    <section className="py-[100px] overflow-hidden" style={{ background: "var(--lp-bg)" }}>
      <div className="mx-auto max-w-[1200px] px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          {/* Phone mockup */}
          <ScrollReveal>
            <div className="mx-auto w-[300px]">
              <div
                className="rounded-[36px] p-3"
                style={{
                  background: "var(--lp-fg)",
                  boxShadow: "var(--lp-shadow-xl)",
                }}
              >
                <div
                  className="rounded-[26px] overflow-hidden"
                  style={{ background: "var(--lp-surface)" }}
                >
                  {/* Phone header */}
                  <div
                    className="flex items-center justify-between px-5 py-4 border-b"
                    style={{ borderColor: "var(--lp-border)" }}
                  >
                    <span className="text-[15px] font-bold" style={{ color: "var(--lp-fg)" }}>
                      {t("showcasePhoneTitle")}
                    </span>
                    <span className="text-xs" style={{ color: "var(--lp-muted)" }}>···</span>
                  </div>

                  {/* Phone recipe image */}
                  <div
                    className="w-full flex items-center justify-center"
                    style={{
                      aspectRatio: "16/10",
                      background: "linear-gradient(135deg, #fde2d3 0%, #f9c4a8 100%)",
                    }}
                  >
                    <CurryIllustration />
                  </div>

                  {/* Phone recipe body */}
                  <div className="px-5 py-4 pb-6">
                    <div className="text-base font-bold mb-1" style={{ color: "var(--lp-fg)" }}>
                      {t("showcaseDishName")}
                    </div>
                    <div className="text-xs mb-3" style={{ color: "var(--lp-muted)" }}>
                      {t("showcaseDishDesc")}
                    </div>

                    {/* Tags */}
                    <div className="flex gap-1.5 flex-wrap mb-4">
                      {["35分钟", "中辣", "鸡胸肉"].map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full px-2.5 py-[3px] text-[11px] font-medium"
                          style={{ background: "var(--lp-warm-100)", color: "var(--lp-muted)" }}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>

                    {/* Fork button */}
                    <div
                      className="w-full py-3 rounded-xl text-sm font-bold text-center text-white"
                      style={{ background: "var(--lp-accent)" }}
                    >
                      {t("showcaseForkBtn")}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </ScrollReveal>

          {/* Content */}
          <div>
            <ScrollReveal>
              <div>
                <div className="text-[13px] font-semibold tracking-[0.08em] uppercase mb-3" style={{ color: "var(--lp-accent)" }}>
                  {t("showcaseLabel")}
                </div>
                <div
                  className="text-[clamp(28px,4vw,42px)] font-extrabold leading-[1.2] tracking-[-0.02em] mb-4"
                  style={{ color: "var(--lp-fg)" }}
                >
                  {t("showcaseTitle")}
                </div>
                <div className="text-[17px] leading-7 max-w-[560px]" style={{ color: "var(--lp-muted)" }}>
                  {t("showcaseDesc")}
                </div>
              </div>
            </ScrollReveal>

            <ul className="mt-8">
              {steps.map((s, i) => (
                <ScrollReveal key={s.key} delay={i * 100}>
                  <li className="flex gap-4 py-5 border-b" style={{ borderColor: "var(--lp-border)" }}>
                    <div
                      className="w-8 h-8 min-w-8 rounded-full grid place-items-center text-[13px] font-extrabold"
                      style={{ background: "var(--lp-accent-light)", color: "var(--lp-accent)" }}
                    >
                      {i + 1}
                    </div>
                    <div>
                      <h4 className="text-[15px] font-bold mb-1" style={{ color: "var(--lp-fg)" }}>
                        {t(`${s.key}Title`)}
                      </h4>
                      <p className="text-[13px] leading-[1.6]" style={{ color: "var(--lp-muted)" }}>
                        {t(`${s.key}Desc`)}
                      </p>
                    </div>
                  </li>
                </ScrollReveal>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
