"use client";

import { ReactNode } from "react";
import { Link } from "@/i18n/routing";

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen" style={{ background: "var(--lp-bg)" }}>
      {/* Brand panel — dark left side */}
      <div
        className="hidden lg:flex flex-col items-center justify-center flex-1 relative overflow-hidden"
        style={{ background: "var(--lp-fg)", padding: "48px" }}
      >
        {/* Radial decorations */}
        <div className="absolute pointer-events-none" style={{ top: "-100px", left: "-100px", width: "400px", height: "400px", background: "radial-gradient(circle, rgba(232,93,58,0.12) 0%, transparent 70%)" }} />
        <div className="absolute pointer-events-none" style={{ bottom: "-80px", right: "-80px", width: "300px", height: "300px", background: "radial-gradient(circle, rgba(232,93,58,0.08) 0%, transparent 70%)" }} />

        <Link href="/" className="relative z-[1] mb-8">
          <img src="/logo_zh.png" alt="吃什么" className="w-[120px] h-[120px] rounded-[28px] object-cover" />
        </Link>

        <h2 className="text-[32px] font-extrabold tracking-[-0.02em] mb-3 relative z-[1]" style={{ color: "white" }}>
          吃什么
        </h2>
        <p className="text-[16px] text-center max-w-[280px] leading-[1.6] relative z-[1]" style={{ color: "rgba(255,255,255,0.55)" }}>
          不知道吃什么？让 AI 帮你选，教你怎么做好吃的。
        </p>

        <div className="flex flex-col gap-3.5 mt-12 relative z-[1]">
          {[
            { icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--lp-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83" /></svg>, text: "AI 智能推荐，每天不重样" },
            { icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--lp-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>, text: "手把手教学，厨房小白也能上手" },
            { icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--lp-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>, text: "社区分享，发现更多好吃的" },
          ].map((f, i) => (
            <div key={i} className="flex items-center gap-3" style={{ color: "rgba(255,255,255,0.7)", fontSize: "14px" }}>
              <div className="w-9 h-9 min-w-[36px] rounded-[10px] grid place-items-center" style={{ background: "rgba(255,255,255,0.08)" }}>
                {f.icon}
              </div>
              <span>{f.text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Form panel — white right side */}
      <div className="flex-1 flex items-center justify-center" style={{ padding: "48px", background: "var(--lp-surface)" }}>
        <div className="w-full" style={{ maxWidth: "400px" }}>
          {/* Mobile logo */}
          <div className="lg:hidden mb-8 text-center">
            <Link href="/">
              <img src="/logo_zh.png" alt="吃什么" className="w-16 h-16 rounded-2xl mx-auto" />
            </Link>
          </div>

          {children}
        </div>
      </div>
    </div>
  );
}
