"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, CalendarDays, Check, Clock3, CookingPot, Loader2, LockKeyhole, ShoppingBasket } from "lucide-react";
import { useLocale } from "next-intl";

import { MealPlanConversation } from "@/components/meal-plan-conversation";
import { RemoteImage } from "@/components/remote-image";
import { Link } from "@/i18n/routing";
import { getMealPlan, getPost, retryMealPlan } from "@/lib/api";

const STAGES: Record<string, { zh: string; en: string }> = {
  queued: { zh: "排队中", en: "In the queue" },
  starting: { zh: "开始整理需求", en: "Getting started" },
  understanding: { zh: "整理你的想法", en: "Understanding your request" },
  adapting_recipes: { zh: "调整选入的菜谱", en: "Adapting selected recipes" },
  generating_combinations: { zh: "生成三种组合方案", en: "Building three arrangements" },
  reviewing_combinations: { zh: "比较菜品搭配", en: "Reviewing the combinations" },
  revising_combination: { zh: "调整最佳组合", en: "Refining the best arrangement" },
  drafting: { zh: "安排每日菜单", en: "Planning each day" },
  validating_candidates: { zh: "检查时间和限制", en: "Checking time and constraints" },
  reviewing: { zh: "检查搭配和执行", en: "Checking the balance" },
  deciding: { zh: "确认这份菜单", en: "Confirming the menu" },
  repairing: { zh: "处理一个冲突", en: "Resolving a conflict" },
  finalizing: { zh: "整理菜单和清单", en: "Finishing your plan" },
};

export function MealPlanView({ planId }: { planId: string }) {
  const locale = useLocale();
  const isZh = locale === "zh";
  const [activeDay, setActiveDay] = useState(1);
  const [sourceImages, setSourceImages] = useState<Record<string, string>>({});
  const [checkedShoppingItems, setCheckedShoppingItems] = useState<Record<string, boolean>>({});
  const query = useQuery({
    queryKey: ["meal-plan", planId],
    queryFn: () => getMealPlan(planId),
    refetchInterval: (state) => ["queued", "running"].includes(state.state.data?.status ?? "") ? 1200 : false,
  });
  const retryMutation = useMutation({ mutationFn: () => retryMealPlan(planId), onSuccess: () => query.refetch() });
  const refreshPlan = () => void query.refetch();
  const plan = query.data;
  const sourcePostIds = plan?.result?.days.flatMap((day) => day.dishes.map((dish) => dish.source_post_id)) ?? [];
  const sourcePostKey = sourcePostIds.join("|");

  useEffect(() => {
    if (!sourcePostIds.length) return;
    let active = true;
    Promise.all(sourcePostIds.map(async (postId) => {
      try {
        const post = await getPost(postId);
        return [postId, post.image_urls[0] ?? ""] as const;
      } catch {
        return [postId, ""] as const;
      }
    })).then((entries) => {
      if (active) setSourceImages(Object.fromEntries(entries));
    });
    return () => { active = false; };
    // The joined key changes only when the plan's source recipes change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourcePostKey]);

  if (query.isLoading) {
    return <div className="site-container py-20"><div className="state-panel"><Loader2 size={22} className="animate-spin" />{isZh ? "正在打开这份计划" : "Opening your plan"}…</div></div>;
  }

  if (!plan || query.isError) {
    return <div className="site-container py-20 text-center"><p className="text-[var(--muted-text)]">{isZh ? "无法加载这份计划。" : "Could not load this plan."}</p><Link href="/meal-plans" className="button-secondary mt-5">{isZh ? "返回计划" : "Back to plans"}</Link></div>;
  }

  if (plan.status === "queued" || plan.status === "running") {
    const stage = STAGES[plan.stage] ?? STAGES.starting;
    return (
      <div className="site-container pb-20 pt-8 md:pt-12">
        <div className="mx-auto max-w-[760px]">
          <Link href="/meal-plans" className="inline-flex items-center gap-1.5 text-sm text-[var(--muted-text)]"><ArrowLeft size={16} />{isZh ? "返回计划列表" : "Back to plans"}</Link>
          <section className="plan-progress">
            <p className="eyebrow">{isZh ? "正在准备你的菜单" : "Preparing your menu"}</p>
            <div className="mt-3 flex items-center gap-3 text-[var(--brand)]"><Loader2 size={23} className="animate-spin" /><span className="text-sm font-semibold">{isZh ? "这份菜单会保留你的原始选择" : "Your original choices are saved"}</span></div>
            <h1 className="mt-6 text-3xl font-bold tracking-[-0.045em] md:text-5xl">{isZh ? stage.zh : stage.en}</h1>
            <p className="mt-4 max-w-xl leading-7 text-[var(--muted-text)]">{isZh ? "你的选择会保留，完成后还能继续调整。" : "Your choices are saved, and you can refine the menu later."}</p>
            <div className="mt-9 h-1.5 overflow-hidden rounded-sm bg-[var(--line)]"><div className="h-full bg-[var(--brand)] transition-[width] duration-300" style={{ width: `${Math.max(3, plan.progress)}%` }} /></div>
            <div className="mt-2 flex justify-between text-xs text-[var(--muted-text)]"><span>{isZh ? "处理中" : "Working"}</span><span>{plan.progress}%</span></div>
          </section>
        </div>
      </div>
    );
  }

  if (plan.status === "failed" || plan.status === "needs_input" || !plan.result) {
    return (
      <div className="site-container py-16">
        <div className="mx-auto max-w-[680px] border-y border-[var(--line)] py-10 text-center">
          <AlertTriangle className="mx-auto text-[var(--danger)]" />
          <h1 className="mt-4 text-xl font-semibold">{plan.status === "needs_input" ? (isZh ? "需要调整一项要求" : "One requirement needs adjusting") : (isZh ? "这次没有规划成功" : "Planning did not complete")}</h1>
          <p className="mx-auto mt-3 max-w-lg leading-7 text-[var(--muted-text)]">{plan.error?.message || (isZh ? "你的选择还在，可以稍后重试。" : "Your choices are saved. Please try again.")}</p>
          {plan.status === "failed" ? (
            <div className="mt-6"><button type="button" className="button-primary" disabled={retryMutation.isPending} onClick={() => retryMutation.mutate()}>{retryMutation.isPending ? (isZh ? "正在重新排队…" : "Re-queueing…") : (isZh ? "用原选择重试" : "Retry with the same choices")}</button>{retryMutation.isError && <p className="mt-3 text-sm text-[var(--danger)]">{retryMutation.error instanceof Error ? retryMutation.error.message : (isZh ? "暂时无法重试。" : "Could not retry.")}</p>}</div>
          ) : <Link href="/meal-plans/new" className="button-primary mt-6">{isZh ? "调整后重试" : "Adjust and retry"}</Link>}
        </div>
      </div>
    );
  }

  const result = plan.result;
  const selectedDay = result.days.find((day) => day.day_index === activeDay) ?? result.days[0];
  const versionLabel = plan.last_change_summary ? (isZh ? "最近调整" : "Recently adjusted") : (isZh ? "初始菜单" : "Initial menu");

  function jumpToDay(dayIndex: number) {
    setActiveDay(dayIndex);
    document.getElementById(`plan-day-${dayIndex}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="site-container pb-24 pt-8 md:pt-12">
      <Link href="/meal-plans" className="inline-flex items-center gap-1.5 text-sm text-[var(--muted-text)] hover:text-[var(--text)]"><ArrowLeft size={16} />{isZh ? "返回计划列表" : "Back to plans"}</Link>
      <header className="plan-result-header mt-5">
        <div>
          <p className="eyebrow flex items-center gap-2"><CalendarDays size={14} />{isZh ? "你的吃饭计划" : "Your meal plan"}</p>
          <h1 className="page-heading">{result.title}</h1>
          <p className="page-description">{result.summary}</p>
          <div className="plan-version-strip">
            <span><strong>{isZh ? "当前版本" : "Current version"}</strong> {versionLabel}</span>
            {plan.locked_days?.length ? <span className="flex items-center gap-1"><LockKeyhole size={13} />{isZh ? `已锁定第 ${plan.locked_days.join("、")} 天` : `Days ${plan.locked_days.join(", ")} locked`}</span> : null}
          </div>
        </div>
        <p className="plan-result-header-note">{plan.last_change_summary || result.decision_summary}</p>
      </header>

      <div className="plan-day-nav" aria-label={isZh ? "选择日期" : "Choose a day"}>
        {result.days.map((day) => (
          <button key={day.day_index} type="button" className="plan-day-tab" data-active={day.day_index === (selectedDay?.day_index ?? activeDay)} onClick={() => jumpToDay(day.day_index)}>
            <strong>{day.label}</strong><span>{day.dishes.length} {isZh ? "道" : "dishes"} · {day.dishes.reduce((sum, dish) => sum + dish.meal.cook_time_minutes, 0)} {isZh ? "分钟" : "min"}</span>
          </button>
        ))}
      </div>

      <div className="plan-result-layout">
        <main>
          <div className="flex items-center justify-between gap-4"><h2 className="section-heading">{isZh ? "每天怎么吃" : "Daily plan"}</h2><span className="meta-text">{result.days.length} {isZh ? "天" : "days"}</span></div>
          <div className="mt-5">
            {result.days.map((day) => (
              <article key={day.day_index} id={`plan-day-${day.day_index}`} className="plan-day-card scroll-mt-8">
                <div className="plan-day-kicker"><span>{day.label} · {day.dishes.length} {isZh ? "道菜" : "dishes"}</span><span className="flex items-center gap-1.5 text-[var(--muted-text)]"><Clock3 size={14} />{day.dishes.reduce((sum, dish) => sum + dish.meal.cook_time_minutes, 0)} {isZh ? "分钟合计" : "min total"}</span></div>
                {day.reason && <p className="plan-day-reason">{day.reason}</p>}
                <div className="plan-dish-stack">
                  {day.dishes.map((dish) => (
                    <section key={dish.source_post_id} className="plan-dish-card">
                      <div className="plan-day-image"><RemoteImage src={sourceImages[dish.source_post_id] ?? ""} alt={dish.meal.name} className="h-full w-full object-cover" /></div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-start justify-between gap-3"><h2>{dish.meal.name}</h2><Link href={`/packs/${dish.source_post_id}`} className="text-sm font-semibold text-[var(--brand-hover)]">{isZh ? "查看原菜谱" : "Original recipe"}</Link></div>
                        <p className="plan-day-reason">{dish.reason}</p>
                        <div className="plan-day-columns">
                          <div><h3>{isZh ? "食材" : "Ingredients"}</h3><ul>{dish.meal.ingredients.map((item) => <li key={item}>{item}</li>)}</ul></div>
                          <div><h3>{isZh ? "步骤" : "Method"}</h3><ol>{dish.meal.steps.map((step, index) => <li key={`${step}-${index}`}>{index + 1}. {step}</li>)}</ol></div>
                        </div>
                        <p className="mt-5 flex flex-wrap items-center gap-3 text-xs text-[var(--muted-text)]"><span className="flex items-center gap-1"><Clock3 size={14} />{dish.meal.cook_time_minutes} {isZh ? "分钟" : "min"}</span>{dish.meal.equipment.length > 0 && <span className="flex items-center gap-1"><CookingPot size={14} />{dish.meal.equipment.join("、")}</span>}</p>
                      </div>
                    </section>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </main>

        <aside className="plan-aside">
          <section className="plan-side-section">
            <div className="flex items-center gap-2"><ShoppingBasket size={18} className="text-[var(--brand)]" /><h2>{isZh ? "合并采购清单" : "Combined shopping list"}</h2></div>
            <ul className="mt-4">{result.shopping_list.map((item) => {
              const itemKey = `${item.name}-${item.amount}`;
              const checked = Boolean(checkedShoppingItems[itemKey]);
              return <li key={itemKey} className={checked ? "opacity-60" : undefined}>
                <label className="flex min-w-0 items-start gap-2">
                  <input type="checkbox" checked={checked} onChange={(event) => setCheckedShoppingItems((current) => ({ ...current, [itemKey]: event.target.checked }))} className="mt-1 accent-[var(--brand)]" />
                  <span className={checked ? "line-through" : undefined}>{item.name}</span>
                </label>
                <span className="text-right text-[var(--muted-text)]">{item.amount}{item.used_on.length > 0 && <small className="block">{isZh ? `第 ${item.used_on.join("、")} 天` : `Days ${item.used_on.join(", ")}`}</small>}</span>
              </li>;
            })}</ul>
          </section>
          {result.prep_notes.length > 0 && <section className="plan-side-section"><h2>{isZh ? "提前做一点" : "Prep ahead"}</h2><ul className="mt-3 space-y-3 text-sm leading-6 text-[var(--muted-text)]">{result.prep_notes.map((note) => <li key={note} className="flex gap-2"><Check size={15} className="mt-1 shrink-0 text-[var(--success)]" />{note}</li>)}</ul></section>}
          <section className="plan-side-section"><div className="flex items-center gap-2"><CalendarDays size={17} className="text-[var(--brand)]" /><h2>{isZh ? "继续调整" : "Keep refining"}</h2></div><p className="mt-3 text-sm leading-6 text-[var(--muted-text)]">{isZh ? "已保存的版本不会被覆盖。" : "Saved versions stay available."}</p></section>
          {result.agent_reports.length > 0 && <details className="plan-side-section plan-agent-details"><summary>{isZh ? "查看规划过程" : "View planning process"}</summary><ol>{result.agent_reports.map((report) => <li key={report.agent}><strong>{report.role}</strong><span>{report.summary}</span></li>)}</ol></details>}
          <MealPlanConversation planId={planId} currentVersionId={plan.current_version_id} onVersionChanged={refreshPlan} />
        </aside>
      </div>
    </div>
  );
}
