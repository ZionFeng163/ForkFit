"use client";

import { ReactNode } from "react";
import { Link } from "@/i18n/routing";

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen" style={{ background: "var(--lp-bg)" }}>
      {/* Brand panel — left side */}
      <div
        className="hidden lg:flex flex-col justify-center px-16 max-w-[480px] flex-shrink-0"
        style={{ background: "linear-gradient(135deg, var(--lp-warm-100) 0%, var(--lp-accent-soft) 100%)" }}
      >
        <Link href="/" className="flex items-center gap-3 mb-10">
          <img src="/logo_zh.png" alt="吃什么" className="h-14 w-auto" />
        </Link>
        <h2 className="text-[28px] font-extrabold leading-[1.2] mb-3" style={{ color: "var(--lp-fg)" }}>
          吃什么
        </h2>
        <p className="text-[15px] leading-[1.7] mb-10" style={{ color: "var(--lp-muted)" }}>
          不知道吃什么？让 AI 帮你选，教你怎么做好吃的。
        </p>

        <div className="flex flex-col gap-5">
          {[
            { icon: "circle", text: "AI 智能推荐，每天不重样" },
            { icon: "file", text: "手把手教学，厨房小白也能上手" },
            { icon: "users", text: "社区分享，发现更多好吃的" },
          ].map((f, i) => (
            <div key={i} className="flex items-center gap-4">
              <div
                className="w-10 h-10 rounded-xl grid place-items-center flex-shrink-0"
                style={{ background: "var(--lp-surface)", color: "var(--lp-accent)" }}
              >
                {f.icon === "circle" && (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83" /></svg>
                )}
                {f.icon === "file" && (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
                )}
                {f.icon === "users" && (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                )}
              </div>
              <span className="text-sm font-medium" style={{ color: "var(--lp-fg-secondary, var(--lp-muted))" }}>{f.text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Form panel — right side */}
      <div className="flex-1 flex items-start justify-center px-6 py-12">
        <div className="w-full max-w-[420px]">
          {/* Mobile logo */}
          <div className="lg:hidden mb-8 text-center">
            <Link href="/">
              <img src="/logo_zh.png" alt="吃什么" className="h-12 w-auto mx-auto" />
            </Link>
          </div>

          {children}
        </div>
      </div>
    </div>
  );
}
