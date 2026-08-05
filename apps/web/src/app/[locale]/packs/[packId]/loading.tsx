import { AppShell } from "@/components/app-shell";

export default function RecipeLoading() {
  return (
    <AppShell>
      <div className="site-container animate-pulse pb-20 pt-8">
        <div className="h-4 w-28 rounded-md bg-[var(--surface-container-high)]" />
        <div className="grid gap-8 border-b border-[var(--line)] py-6 md:grid-cols-[1fr_280px]">
          <div><div className="h-8 w-3/5 rounded-md bg-[var(--surface-container-high)]" /><div className="mt-4 h-4 w-4/5 rounded-md bg-[var(--surface-container)]" /></div>
          <div className="h-11 rounded-xl bg-[var(--surface-container-high)]" />
        </div>
        <div className="h-[230px] rounded-2xl bg-[var(--surface-container-high)] sm:h-[360px] lg:h-[440px] xl:h-[460px]" />
      </div>
    </AppShell>
  );
}
