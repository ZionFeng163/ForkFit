"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Check, Clock3, CookingPot, Loader2, LockKeyhole, ShoppingBasket } from "lucide-react";
import { useLocale } from "next-intl";

import { MealPlanConversation } from "@/components/meal-plan-conversation";
import { RemoteImage } from "@/components/remote-image";
import { Link } from "@/i18n/routing";
import { getMealPlan, getPost, retryMealPlan } from "@/lib/api";
import { useAuth } from "@/components/auth-provider";
import { useStoredState } from "@/lib/use-stored-state";

const STAGES: Record<string, { zh: string; en: string }> = {
  queued: { zh: "已提交，等待开始", en: "Submitted, waiting to start" },
  starting: { zh: "开始整理需求", en: "Getting started" },
  understanding: { zh: "整理你的想法", en: "Understanding your request" },
  adapting_recipes: { zh: "按你的要求调整菜谱", en: "Adapting recipes to your needs" },
  generating_combinations: { zh: "搭配每天的菜单", en: "Putting together each day" },
  reviewing_combinations: { zh: "审核菜单的搭配和可执行性", en: "Reviewing balance and practicality" },
  revising_combination: { zh: "修正审核发现的问题", en: "Addressing review findings" },
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
  const { user } = useAuth();
  const [checkedShoppingItems, setCheckedShoppingItems, shoppingReady] = useStoredState<Record<string, boolean>>(
    user ? `forkfit.shopping.v1.${user.id}.${planId}` : null, {},
    (value) => value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).filter(([, checked]) => checked === true)) : {},
  );
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

  if (!plan) {
    return <div className="site-container py-20 text-center"><p className="text-[var(--muted-text)]">{isZh ? "无法加载这份计划。" : "Could not load this plan."}</p><Link href="/meal-plans" className="button-secondary mt-5">{isZh ? "返回计划" : "Back to plans"}</Link></div>;
  }

  if (plan.status === "queued" || plan.status === "running") {
    const stage = STAGES[plan.status === "queued" ? "queued" : plan.stage]
      ?? { zh: "正在处理你的规划", en: "Processing your plan" };
    return (
      <div className="site-container pb-20 pt-8 md:pt-12">
        <div className="mx-auto max-w-[760px]">
          <Link href="/meal-plans" className="inline-flex items-center gap-1.5 text-sm text-[var(--muted-text)]"><ArrowLeft size={16} />{isZh ? "返回计划列表" : "Back to plans"}</Link>
          <section className="plan-progress">
            <h1 className="page-heading">{isZh ? "正在准备你的菜单" : "Preparing your menu"}</h1>
            <div role="status" aria-live="polite" aria-atomic="true" className="mt-5 flex items-start gap-3">
              {query.isError ? <AlertTriangle size={20} className="mt-0.5 shrink-0" aria-hidden="true" /> : <Loader2 size={20} className="mt-0.5 shrink-0 animate-spin text-[var(--brand)]" aria-hidden="true" />}
              <p>{query.isError ? (isZh ? "暂时无法更新进度，不代表规划失败。正在尝试重新连接。" : "Progress is temporarily unavailable. This does not mean planning failed. Reconnecting.") : (isZh ? stage.zh : stage.en)}</p>
            </div>
            {query.isError && <button type="button" className="button-secondary mt-3" disabled={query.isFetching} onClick={() => void query.refetch()}>{isZh ? "重新连接" : "Reconnect"}</button>}
            <p className="mt-4 max-w-xl leading-7 text-[var(--muted-text)]">{isZh ? "可以先离开，稍后从「吃饭计划」查看结果；需要补充信息时会在这里提问。" : "You can leave and return from Meal plans. Any questions will appear here."}</p>
          </section>
        </div>
      </div>
    );
  }

  if (plan.status === "needs_input" && !plan.result) {
    return <div className="site-container py-10"><div className="mx-auto max-w-[680px]">
      <h1 className="page-heading mb-6">{isZh ? "确认一下，再安排菜单" : "One question before planning"}</h1>
      <MealPlanConversation planId={planId} currentVersionId={null} initialPlanning initialQuestion={plan.error?.message} onVersionChanged={refreshPlan} />
      <Link href="/meal-plans/new" className="button-secondary mt-6">{isZh ? "重新选菜" : "Choose different recipes"}</Link>
    </div></div>;
  }

  if (plan.status === "failed" || !plan.result) {
    return (
      <div className="site-container py-16">
        <div className="mx-auto max-w-[680px] border-y border-[var(--line)] py-10 text-center">
          <AlertTriangle className="mx-auto text-[var(--danger)]" />
          <h1 className="mt-4 text-xl font-semibold">{isZh ? "这次没有规划成功" : "Planning did not complete"}</h1>
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
  const versionLabel = !plan.last_change_summary || plan.last_change_summary === "已生成第一版菜单。" ? (isZh ? "初始菜单" : "Initial menu") : (isZh ? "已调整" : "Updated");

  function jumpToDay(dayIndex: number) {
    setActiveDay(dayIndex);
    document.getElementById(`plan-day-${dayIndex}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="site-container pb-24 pt-8 md:pt-12">
      <Link href="/meal-plans" className="inline-flex items-center gap-1.5 text-sm text-[var(--muted-text)] hover:text-[var(--text)]"><ArrowLeft size={16} />{isZh ? "返回计划列表" : "Back to plans"}</Link>
      {query.isError && <p role="alert" className="mt-4 text-sm text-[var(--danger)]">{isZh ? "暂时无法更新菜单，当前显示上次保存的版本。" : "Cannot refresh the menu. Showing the last saved version."}<button type="button" className="ml-2 underline" onClick={() => void query.refetch()}>{isZh ? "重试" : "Retry"}</button></p>}
      <header className="plan-result-header mt-5">
        <div>
          <h1 className="page-heading">{result.title}</h1>
          <div className="plan-version-strip">
            <span><strong>{isZh ? "当前版本" : "Current version"}</strong> {versionLabel}</span>
            {plan.locked_days?.length ? <span className="flex items-center gap-1"><LockKeyhole size={13} />{isZh ? `已锁定第 ${plan.locked_days.join("、")} 天` : `Days ${plan.locked_days.join(", ")} locked`}</span> : null}
          </div>
        </div>
        {plan.last_change_summary && <p className="plan-result-header-note">{plan.last_change_summary}</p>}
      </header>
      {(result.summary || result.decision_summary) && <details className="plan-explanation mt-4"><summary>{isZh ? "查看安排说明" : "Why this plan"}</summary><p className="mt-3 leading-7">{result.summary}</p><p className="mt-2 leading-7">{result.decision_summary}</p></details>}

      <div className="plan-day-nav" aria-label={isZh ? "选择日期" : "Choose a day"}>
        {result.days.map((day) => (
          <button key={day.day_index} type="button" className="plan-day-tab" data-active={day.day_index === (selectedDay?.day_index ?? activeDay)} onClick={() => jumpToDay(day.day_index)}>
            <strong>{day.label}</strong><span>{day.dishes.length} {isZh ? "道" : "dishes"} · {day.dishes.reduce((sum, dish) => sum + dish.meal.cook_time_minutes, 0)} {isZh ? "分钟" : "min"}</span>
          </button>
        ))}
      </div>

      <div className="plan-result-layout">
        <div className="plan-conversation-slot"><MealPlanConversation planId={planId} currentVersionId={plan.current_version_id} onVersionChanged={refreshPlan} /></div>
        <div className="plan-days min-w-0">
          <div className="flex items-center justify-between gap-4"><h2 className="section-heading">{isZh ? "每天怎么吃" : "Daily plan"}</h2><span className="meta-text">{result.days.length} {isZh ? "天" : "days"}</span></div>
          <div className="mt-5">
            {result.days.map((day) => (
              <article key={day.day_index} id={`plan-day-${day.day_index}`} className="plan-day-card scroll-mt-8">
                <div className="plan-day-kicker"><span>{day.label} · {day.dishes.length} {isZh ? "道菜" : "dishes"}</span><span className="flex items-center gap-1.5 text-[var(--muted-text)]"><Clock3 size={14} />{day.dishes.reduce((sum, dish) => sum + dish.meal.cook_time_minutes, 0)} {isZh ? "分钟合计" : "min total"}</span></div>
                {(day.reason || day.dishes.some((dish) => dish.reason)) && <details className="plan-explanation mt-2"><summary>{isZh ? "查看安排说明" : "Why this day"}</summary>{day.reason && <p className="plan-day-reason">{day.reason}</p>}{day.dishes.filter((dish) => dish.reason).map((dish) => <p key={dish.source_post_id} className="plan-day-reason">{dish.meal.name}：{dish.reason}</p>)}</details>}
                <div className="plan-dish-stack">
                  {day.dishes.map((dish) => (
                    <section key={dish.source_post_id} className="plan-dish-card">
                      <div className="plan-day-image"><RemoteImage src={sourceImages[dish.source_post_id] ?? ""} alt={dish.meal.name} className="h-full w-full object-cover" /></div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-start justify-between gap-3"><h2>{dish.meal.name}</h2><Link href={`/packs/${dish.source_post_id}`} className="text-sm font-semibold text-[var(--brand-hover)]">{isZh ? "查看原菜谱" : "Original recipe"}</Link></div>
                        <p className="mt-4 flex flex-wrap items-center gap-3 text-sm text-[var(--muted-text)]"><span className="flex items-center gap-1"><Clock3 size={14} />{dish.meal.cook_time_minutes} {isZh ? "分钟" : "min"}</span>{dish.meal.equipment.length > 0 && <span className="flex items-center gap-1"><CookingPot size={14} />{dish.meal.equipment.join("、")}</span>}</p>
                      </div>
                        <div className="plan-day-columns">
                          <div><h3>{isZh ? "食材" : "Ingredients"}</h3><ul>{dish.meal.ingredients.map((item) => <li key={item}>{item}</li>)}</ul></div>
                          <div><h3>{isZh ? "步骤" : "Method"}</h3><ol>{dish.meal.steps.map((step, index) => <li key={`${step}-${index}`}>{index + 1}. {cleanStepPrefix(step)}</li>)}</ol></div>
                        </div>
                    </section>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>

        <aside className="plan-aside">
          <section className="plan-side-section">
            <div className="flex items-center gap-2"><ShoppingBasket size={18} className="text-[var(--brand)]" /><h2>{isZh ? "合并采购清单" : "Combined shopping list"}</h2></div>
            <ul className="mt-4">{result.shopping_list.map((item) => {
              const itemKey = `${item.name}-${item.amount}`;
              const checked = Boolean(checkedShoppingItems[itemKey]);
              return <li key={itemKey} className={checked ? "opacity-60" : undefined}>
                <label className="flex min-w-0 items-start gap-2">
                  <input type="checkbox" disabled={!shoppingReady} checked={checked} onChange={(event) => { const checked = event.target.checked; setCheckedShoppingItems((current) => ({ ...current, [itemKey]: checked })); }} className="mt-1 accent-[var(--brand)]" />
                  <span className={checked ? "line-through" : undefined}>{item.name}</span>
                </label>
                <span className="text-right text-[var(--muted-text)]">{item.amount}{item.used_on.length > 0 && <small className="block">{isZh ? `第 ${item.used_on.join("、")} 天` : `Days ${item.used_on.join(", ")}`}</small>}</span>
              </li>;
            })}</ul>
          </section>
          {result.prep_notes.length > 0 && <section className="plan-side-section"><h2>{isZh ? "提前做一点" : "Prep ahead"}</h2><ul className="mt-3 space-y-3 text-sm leading-6 text-[var(--muted-text)]">{result.prep_notes.map((note) => <li key={note} className="flex gap-2"><Check size={15} className="mt-1 shrink-0 text-[var(--success)]" />{note}</li>)}</ul></section>}
        </aside>
      </div>
    </div>
  );
}
function cleanStepPrefix(step: string) {
  return step.replace(/^\s*(?:步骤\s*)?\d+\s*[.)、：:]\s*/, "").trim();
}
