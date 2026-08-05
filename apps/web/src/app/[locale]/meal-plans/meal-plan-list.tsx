"use client";

import { useQuery } from "@tanstack/react-query";
import { CalendarDays, ChevronRight, Clock3, Loader2, Plus } from "lucide-react";
import { useLocale } from "next-intl";

import { Link } from "@/i18n/routing";
import { listMealPlans } from "@/lib/api";

const STATUS_ZH: Record<string, string> = {
  queued: "排队中",
  running: "规划中",
  succeeded: "已完成",
  failed: "失败",
  needs_input: "需要调整",
};

export function MealPlanList() {
  const locale = useLocale();
  const isZh = locale === "zh";
  const query = useQuery({
    queryKey: ["meal-plans"],
    queryFn: listMealPlans,
    refetchInterval: (state) =>
      state.state.data?.some((plan) => ["queued", "running"].includes(plan.status))
        ? 2000
        : false,
  });

  return (
    <div className="site-container pb-20 pt-8 md:pt-12">
      <header className="flex flex-wrap items-end justify-between gap-5 border-b border-[var(--line)] pb-7">
        <div>
          <p className="mb-2 text-sm font-semibold text-[var(--brand-hover)]">
            {isZh ? "多日菜单" : "Multi-day meals"}
          </p>
          <h1 className="page-heading">{isZh ? "这几天吃什么" : "What to eat this week"}</h1>
          <p className="mt-3 max-w-2xl text-[var(--muted-text)]">
            {isZh
              ? "从喜欢的菜开始排，也可以只说一句最近想吃什么。之后还可以继续调整，不满意就恢复上一版。"
              : "Start with recipes you like, or describe what you feel like eating."}
          </p>
        </div>
        <Link href="/meal-plans/new" className="button-primary">
          <Plus size={16} />
          {isZh ? "新建计划" : "New plan"}
        </Link>
      </header>

      {query.isLoading ? (
        <div className="flex items-center gap-2 py-16 text-sm text-[var(--muted-text)]">
          <Loader2 size={18} className="animate-spin" />
          {isZh ? "正在加载计划" : "Loading plans"}
        </div>
      ) : query.isError ? (
        <div className="status-panel mt-8 text-sm text-[var(--danger)]">
          {isZh ? "计划暂时无法加载，请稍后重试。" : "Plans are temporarily unavailable."}
        </div>
      ) : query.data?.length ? (
        <div className="mt-8 divide-y divide-[var(--line)] border-y border-[var(--line)]">
          {query.data.map((plan) => {
            const title = plan.result?.title || (isZh ? "新的多日菜单" : "New meal plan");
            const statusLabel = isZh ? STATUS_ZH[plan.status] || plan.status : plan.status;
            const dateLabel = new Date(plan.created_at).toLocaleDateString(isZh ? "zh-CN" : "en-US", { month: "short", day: "numeric" });
            return (
              <Link
                key={plan.plan_id}
                href={`/meal-plans/${plan.plan_id}`}
                className="group grid gap-4 py-5 transition-colors hover:bg-[color-mix(in_srgb,var(--surface)_65%,transparent)] sm:grid-cols-[1fr_auto] sm:items-center sm:px-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-3">
                    <CalendarDays size={18} className="shrink-0 text-[var(--brand)]" />
                    <h2 className="truncate text-base font-semibold">{title}</h2>
                  </div>
                  <p className="mt-2 line-clamp-1 pl-[30px] text-sm text-[var(--muted-text)]">
                    {plan.result?.summary ||
                      (plan.status === "running"
                        ? `${plan.progress}% · ${plan.stage}`
                        : plan.error?.message || (isZh ? "等待开始" : "Waiting"))}
                  </p>
                </div>
                <div className="flex items-center justify-between gap-4 pl-[30px] text-xs text-[var(--muted-text)] sm:justify-end sm:pl-0">
                  <span className="flex items-center gap-1.5">
                    <span className={`h-1.5 w-1.5 rounded-full ${plan.status === "succeeded" ? "bg-[var(--success)]" : plan.status === "failed" ? "bg-[var(--danger)]" : "bg-[var(--brand)]"}`} />
                    {statusLabel}
                  </span>
                  <span className="flex items-center gap-1"><Clock3 size={13} />{dateLabel}</span>
                  <ChevronRight size={16} className="transition-transform group-hover:translate-x-0.5" />
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="py-20 text-center">
          <CalendarDays className="mx-auto text-[var(--muted-text)]" />
          <h2 className="mt-4 text-lg font-semibold">{isZh ? "还没有菜单计划" : "No meal plans yet"}</h2>
          <p className="mt-2 text-sm text-[var(--muted-text)]">
            {isZh ? "选几道喜欢的菜，或者直接告诉我们最近想吃什么。" : "Pick a few recipes or describe your cravings."}
          </p>
        </div>
      )}
    </div>
  );
}
