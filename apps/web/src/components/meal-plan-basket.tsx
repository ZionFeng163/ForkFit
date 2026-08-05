"use client";

import { CalendarDays, X } from "lucide-react";
import { useLocale } from "next-intl";

import { useMealPlanSelection } from "@/components/meal-plan-provider";
import { Link, usePathname } from "@/i18n/routing";

export function MealPlanBasket() {
  const locale = useLocale();
  const pathname = usePathname();
  const { selected, remove } = useMealPlanSelection();

  // Recipe detail already has its own compact add-to-plan action bar on mobile.
  // Keeping the basket there creates two stacked controls competing for the same space.
  if (selected.length === 0 || pathname.startsWith("/meal-plans") || pathname.startsWith("/packs/")) return null;

  return (
    <aside className="meal-plan-basket" aria-label={locale === "zh" ? "待规划菜谱" : "Recipes to plan"}>
      <div className="flex min-w-0 items-center gap-3">
        <CalendarDays size={18} className="shrink-0 text-[var(--brand)]" />
        <div className="min-w-0">
          <strong>{locale === "zh" ? `已选 ${selected.length} 道菜` : `${selected.length} selected`}</strong>
          <p className="truncate">{selected.map((item) => item.title).join("、")}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {selected.slice(-2).map((item) => (
          <button
            key={item.id}
            type="button"
            className="button-quiet h-8 min-h-8 px-2"
            onClick={() => remove(item.id)}
            title={locale === "zh" ? `移除 ${item.title}` : `Remove ${item.title}`}
          >
            <X size={14} />
          </button>
        ))}
        <Link href="/meal-plans/new" className="button-primary h-9 min-h-9">
          {locale === "zh" ? "去安排" : "Plan meals"}
        </Link>
      </div>
    </aside>
  );
}
