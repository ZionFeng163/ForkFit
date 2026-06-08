"use client";

import { useTranslations } from "next-intl";
import { ScrollReveal } from "./scroll-reveal";

const testimonials = [
  { key: "testimonial1", avatar: "林" },
  { key: "testimonial2", avatar: "张" },
  { key: "testimonial3", avatar: "杰" },
];

export function TestimonialsSection() {
  const t = useTranslations("Home");

  return (
    <section className="py-[100px]" style={{ background: "var(--lp-warm-100)" }}>
      <div className="mx-auto max-w-[1200px] px-6">
        <ScrollReveal>
          <div className="text-center">
            <div className="text-[13px] font-semibold tracking-[0.08em] uppercase mb-3" style={{ color: "var(--lp-accent)" }}>
              {t("testimonialLabel")}
            </div>
            <div
              className="text-[clamp(28px,4vw,42px)] font-extrabold leading-[1.2] tracking-[-0.02em]"
              style={{ color: "var(--lp-fg)" }}
            >
              {t("testimonialTitle")}
            </div>
          </div>
        </ScrollReveal>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
          {testimonials.map((test, i) => (
            <ScrollReveal key={test.key} delay={i * 100}>
              <div
                className="rounded-2xl p-7 border h-full"
                style={{
                  background: "var(--lp-surface)",
                  borderColor: "var(--lp-border)",
                }}
              >
                <div className="text-sm tracking-[2px] mb-3" style={{ color: "#f5a623" }}>
                  ★★★★★
                </div>
                <p className="text-sm leading-[1.7] mb-4" style={{ color: "var(--lp-fg)" }}>
                  &ldquo;{t(`${test.key}Text`)}&rdquo;
                </p>
                <div className="flex items-center gap-3">
                  <div
                    className="w-9 h-9 rounded-full grid place-items-center text-sm font-bold"
                    style={{ background: "var(--lp-warm-200)", color: "var(--lp-muted)" }}
                  >
                    {test.avatar}
                  </div>
                  <div>
                    <div className="text-[13px] font-semibold" style={{ color: "var(--lp-fg)" }}>
                      {t(`${test.key}Name`)}
                    </div>
                    <div className="text-xs" style={{ color: "var(--lp-muted)" }}>
                      {t(`${test.key}Role`)}
                    </div>
                  </div>
                </div>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
