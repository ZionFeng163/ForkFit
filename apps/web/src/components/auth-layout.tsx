"use client";

import { ReactNode } from "react";

import { BrandLogo } from "@/components/brand-logo";
import { Link } from "@/i18n/routing";

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--canvas)]">
      <header className="h-16 border-b border-[var(--line)] bg-[var(--surface)]">
        <div className="site-container flex h-full items-center justify-between">
          <BrandLogo />
          <Link href="/discover" className="text-sm font-medium text-[var(--muted-text)] hover:text-[var(--text)]">先看看菜谱</Link>
        </div>
      </header>
      <main className="mx-auto flex min-h-[calc(100vh-64px)] w-full max-w-[440px] items-center px-5 py-10">
        <div className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] p-6 sm:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
