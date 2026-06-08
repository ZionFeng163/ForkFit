"use client";

import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/routing";

/* ---------- SVG illustrations for recipe cards ---------- */
function BroccoliIllustration() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
      <circle cx="32" cy="28" r="18" fill="#2d8a56" opacity="0.15" />
      <circle cx="26" cy="24" r="10" fill="#2d8a56" opacity="0.25" />
      <circle cx="38" cy="24" r="10" fill="#2d8a56" opacity="0.2" />
      <circle cx="32" cy="32" r="8" fill="#2d8a56" opacity="0.3" />
      <rect x="30" y="38" width="4" height="14" rx="2" fill="#8B6914" opacity="0.4" />
    </svg>
  );
}

function NoodleIllustration() {
  return (
    <svg width="52" height="52" viewBox="0 0 52 52" fill="none">
      <ellipse cx="26" cy="34" rx="20" ry="12" fill="#e85d3a" opacity="0.12" />
      <ellipse cx="26" cy="30" rx="18" ry="10" fill="#e85d3a" opacity="0.18" />
      <path d="M18 28 Q22 20 26 28 Q30 20 34 28" stroke="#e85d3a" strokeWidth="2" fill="none" opacity="0.4" />
      <path d="M20 26 Q24 18 28 26" stroke="#e85d3a" strokeWidth="1.5" fill="none" opacity="0.3" />
    </svg>
  );
}

function EggIllustration() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
      <ellipse cx="24" cy="28" rx="16" ry="12" fill="#d4a054" opacity="0.15" />
      <circle cx="24" cy="24" r="10" fill="#fff" opacity="0.6" />
      <circle cx="24" cy="24" r="5" fill="#f5a623" opacity="0.5" />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l2.09 6.26L20 10l-5.91 1.74L12 18l-2.09-6.26L4 10l5.91-1.74z" />
    </svg>
  );
}

/* ---------- Hero Section ---------- */
export function HeroSection() {
  const t = useTranslations("Home");

  return (
    <section
      className="relative min-h-screen flex items-center pt-24 pb-20 overflow-hidden"
      style={{ background: "var(--lp-bg)" }}
    >
      {/* Decorative gradient */}
      <div
        className="absolute pointer-events-none"
        style={{
          top: "-200px",
          right: "-200px",
          width: "600px",
          height: "600px",
          background: "radial-gradient(circle, var(--lp-accent-soft) 0%, transparent 70%)",
          opacity: 0.6,
        }}
      />

      <div className="mx-auto max-w-[1200px] w-full px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          {/* Left: text content */}
          <div className="relative z-[1]">
            {/* Badge */}
            <div
              className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-[13px] font-semibold mb-7"
              style={{ background: "var(--lp-accent-light)", color: "var(--lp-accent)" }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full animate-pulse-soft"
                style={{ background: "var(--lp-accent)" }}
              />
              {t("heroBadge")}
            </div>

            <h1
              className="text-[clamp(36px,5vw,56px)] font-extrabold leading-[1.1] tracking-[-0.03em] mb-5"
              style={{ color: "var(--lp-fg)" }}
            >
              {t("heroTitle")}
              <br />
              <span
                className="bg-clip-text text-transparent"
                style={{
                  backgroundImage: "linear-gradient(135deg, var(--lp-accent) 0%, #f4845f 100%)",
                }}
              >
                {t("heroTitleHighlight")}
              </span>
            </h1>

            <p
              className="text-lg leading-7 max-w-[460px] mb-9"
              style={{ color: "var(--lp-muted)" }}
            >
              {t("heroDescription")}
            </p>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/discover"
                className="inline-flex items-center gap-2 rounded-full px-8 py-3.5 text-base font-semibold text-white transition-all duration-200 hover:-translate-y-0.5"
                style={{
                  background: "var(--lp-accent)",
                  boxShadow: "0 4px 16px rgba(232,93,58,0.25)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--lp-accent-hover)";
                  e.currentTarget.style.boxShadow = "0 6px 24px rgba(232,93,58,0.35)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "var(--lp-accent)";
                  e.currentTarget.style.boxShadow = "0 4px 16px rgba(232,93,58,0.25)";
                }}
              >
                {t("heroCta")}
                <ArrowRight size={16} />
              </Link>
              <Link
                href="/profile"
                className="inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-base font-semibold transition-all duration-200 hover:-translate-y-px"
                style={{
                  background: "var(--lp-surface)",
                  color: "var(--lp-fg)",
                  border: "1.5px solid var(--lp-border)",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--lp-fg)")}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--lp-border)")}
              >
                {t("heroCtaSecondary")}
              </Link>
            </div>
          </div>

          {/* Right: recipe cards composition */}
          <div className="relative z-[1] hidden lg:block">
            <div className="relative w-full" style={{ aspectRatio: "1/0.85" }}>
              {/* Card 1 — main */}
              <div
                className="absolute bg-[var(--lp-surface)] rounded-2xl overflow-hidden transition-transform duration-500 hover:-translate-y-1"
                style={{
                  width: "280px",
                  top: 0,
                  right: "10%",
                  zIndex: 3,
                  boxShadow: "var(--lp-shadow-lg)",
                }}
              >
                <div
                  className="w-full flex items-center justify-center"
                  style={{
                    aspectRatio: "4/3",
                    background: "linear-gradient(135deg, #e8f5ee, #c8e6d5)",
                  }}
                >
                  <BroccoliIllustration />
                </div>
                <div className="p-4">
                  <span
                    className="inline-block rounded-full px-2.5 py-[3px] text-[11px] font-semibold mb-2"
                    style={{ background: "var(--lp-accent-light)", color: "var(--lp-accent)" }}
                  >
                    热门
                  </span>
                  <div className="text-[15px] font-bold leading-tight mb-1.5" style={{ color: "var(--lp-fg)" }}>
                    蒜蓉西兰花
                  </div>
                  <div className="flex items-center gap-3 text-xs" style={{ color: "var(--lp-muted)" }}>
                    <span className="flex items-center gap-1">15分钟</span>
                    <span className="flex items-center gap-1">120千卡</span>
                  </div>
                </div>
              </div>

              {/* Card 2 — smaller */}
              <div
                className="absolute bg-[var(--lp-surface)] rounded-2xl overflow-hidden transition-transform duration-500 hover:-translate-y-1"
                style={{
                  width: "220px",
                  bottom: "10%",
                  left: "5%",
                  zIndex: 2,
                  boxShadow: "var(--lp-shadow-lg)",
                }}
              >
                <div
                  className="w-full flex items-center justify-center"
                  style={{
                    aspectRatio: "4/3",
                    background: "linear-gradient(135deg, #fef3e2, #fde2c0)",
                  }}
                >
                  <NoodleIllustration />
                </div>
                <div className="p-4">
                  <span
                    className="inline-block rounded-full px-2.5 py-[3px] text-[11px] font-semibold mb-2"
                    style={{ background: "var(--lp-green-light)", color: "var(--lp-green)" }}
                  >
                    轻食
                  </span>
                  <div className="text-[15px] font-bold leading-tight mb-1" style={{ color: "var(--lp-fg)" }}>
                    酸辣粉丝汤
                  </div>
                  <div className="flex items-center gap-3 text-xs" style={{ color: "var(--lp-muted)" }}>
                    <span className="flex items-center gap-1">20分钟</span>
                  </div>
                </div>
              </div>

              {/* Card 3 — faded */}
              <div
                className="absolute bg-[var(--lp-surface)] rounded-2xl overflow-hidden transition-transform duration-500 hover:-translate-y-1"
                style={{
                  width: "200px",
                  top: "30%",
                  right: 0,
                  zIndex: 1,
                  opacity: 0.7,
                  boxShadow: "var(--lp-shadow-lg)",
                }}
              >
                <div
                  className="w-full flex items-center justify-center"
                  style={{
                    aspectRatio: "4/3",
                    background: "linear-gradient(135deg, #fef7e8, #fdecc8)",
                  }}
                >
                  <EggIllustration />
                </div>
                <div className="p-4">
                  <div className="text-[15px] font-bold leading-tight mb-1" style={{ color: "var(--lp-fg)" }}>
                    番茄炒蛋
                  </div>
                  <div className="flex items-center gap-3 text-xs" style={{ color: "var(--lp-muted)" }}>
                    <span className="flex items-center gap-1">10分钟</span>
                  </div>
                </div>
              </div>

              {/* Floating AI badge */}
              <div
                className="absolute z-[5] bg-[var(--lp-surface)] rounded-[10px] p-3 flex items-center gap-2.5 animate-float"
                style={{
                  bottom: "20%",
                  left: "-10px",
                  boxShadow: "var(--lp-shadow-lg)",
                }}
              >
                <div
                  className="w-9 h-9 rounded-[10px] grid place-items-center"
                  style={{ background: "linear-gradient(135deg, var(--lp-accent), #f4845f)" }}
                >
                  <SparkleIcon />
                </div>
                <div>
                  <div className="text-[13px] font-semibold" style={{ color: "var(--lp-fg)" }}>AI 正在调整</div>
                  <div className="text-[11px]" style={{ color: "var(--lp-muted)" }}>去掉花生 · 加入低钠</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
