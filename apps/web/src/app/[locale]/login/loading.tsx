import { BrandLogo } from "@/components/brand-logo";

export default function LoginLoading() {
  return (
    <div className="min-h-screen bg-[var(--canvas)]">
      <header className="h-16 border-b border-[var(--line)] bg-[var(--surface)]"><div className="site-container flex h-full items-center"><BrandLogo /></div></header>
      <main className="mx-auto flex min-h-[calc(100vh-64px)] w-full max-w-[420px] items-start px-5 pb-12 pt-20 md:pt-24">
        <div className="h-[480px] w-full animate-pulse rounded-lg border border-[var(--line)] bg-[var(--surface)] p-8"><div className="h-8 w-32 rounded bg-[#e6dfd5]" /><div className="mt-8 h-11 rounded bg-[#ebe5dc]" /><div className="mt-5 h-11 rounded bg-[#ebe5dc]" /></div>
      </main>
    </div>
  );
}
