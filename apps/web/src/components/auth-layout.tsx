"use client";

import { ReactNode } from "react";

import { BrandLogo } from "@/components/brand-logo";
import { Link } from "@/i18n/routing";

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="site-header">
        <div className="site-container flex h-full items-center justify-between">
          <BrandLogo />
          <Link href="/discover" className="button-quiet h-9 min-h-9 px-3 text-sm">先看看菜谱</Link>
        </div>
      </header>
      <main className="mx-auto flex min-h-[calc(100vh-64px)] w-full max-w-[420px] items-start px-5 pb-12 pt-12 md:pt-16">
        <div className="w-full rounded-xl border border-[var(--separator)] bg-[var(--surface)] p-6 sm:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
