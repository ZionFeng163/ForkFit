import { AppShell } from "@/components/app-shell";

export default function DiscoverLoading() {
  return (
    <AppShell>
      <div className="site-container animate-pulse pb-16 pt-10">
        <div className="grid gap-5 border-b border-[var(--line)] pb-6 md:grid-cols-[1fr_360px]">
          <div><div className="h-9 w-40 rounded bg-[#e6dfd5]" /><div className="mt-3 h-4 w-72 rounded bg-[#ebe5dc]" /></div>
          <div className="h-11 rounded-lg bg-[#e6dfd5]" />
        </div>
        <div className="h-12 border-b border-[var(--line)]" />
        <div className="grid gap-x-5 gap-y-9 pt-8 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index}><div className="aspect-[4/3] rounded-lg bg-[#e6dfd5]" /><div className="mt-4 h-4 w-4/5 rounded bg-[#e6dfd5]" /><div className="mt-3 h-3 w-2/5 rounded bg-[#ebe5dc]" /></div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
