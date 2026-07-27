import { AppShell } from "@/components/app-shell";

export default function RecipeLoading() {
  return (
    <AppShell>
      <div className="site-container animate-pulse pb-20 pt-8">
        <div className="h-4 w-28 rounded bg-[#e6dfd5]" />
        <div className="grid gap-8 border-b border-[var(--line)] py-6 md:grid-cols-[1fr_280px]">
          <div><div className="h-8 w-3/5 rounded bg-[#e6dfd5]" /><div className="mt-4 h-4 w-4/5 rounded bg-[#ebe5dc]" /></div>
          <div className="h-10 rounded-lg bg-[#e6dfd5]" />
        </div>
        <div className="h-[230px] rounded-lg bg-[#e6dfd5] sm:h-[360px] lg:h-[440px] xl:h-[460px]" />
      </div>
    </AppShell>
  );
}
