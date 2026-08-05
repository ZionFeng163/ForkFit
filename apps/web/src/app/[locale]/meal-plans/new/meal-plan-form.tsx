"use client";

import { FormEvent, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CalendarDays, Loader2, Plus, X } from "lucide-react";
import { useLocale } from "next-intl";

import { useMealPlanSelection } from "@/components/meal-plan-provider";
import { RemoteImage } from "@/components/remote-image";
import { Link, useRouter } from "@/i18n/routing";
import { createMealPlan } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import type { MealPlanDraft } from "@/lib/frontend-adapter";
import { loadUserProfileForm, profileFormToUserProfile } from "@/lib/user-profile";

const EXAMPLES = [
  "清淡一点，工作日 30 分钟内",
  "三天高蛋白，不吃香菜",
  "两天家常菜，多一点蔬菜",
];

export function MealPlanForm() {
  const locale = useLocale();
  const isZh = locale === "zh";
  const router = useRouter();
  const searchParams = useSearchParams();
  const mealPlan = useMealPlanSelection();
  const [days, setDays] = useState(Math.max(3, mealPlan.selected.length));
  const [peopleCount, setPeopleCount] = useState(1);
  const [requestText, setRequestText] = useState(() => searchParams.get("request_text") ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!requestText.trim() && mealPlan.selected.length === 0) {
      setError(isZh ? "请至少选择一道菜，或写下你想吃什么。" : "Pick a recipe or describe what you want.");
      return;
    }
    if (mealPlan.selected.length > days) {
      setError(isZh ? "规划天数不能少于已选菜数。" : "The plan needs at least one day per selected recipe.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const draft: MealPlanDraft = {
        days,
        peopleCount,
        requestText: requestText.trim(),
        selectedRecipeIds: mealPlan.selected.map((item) => item.id),
      };
      const storedProfile = profileFormToUserProfile(loadUserProfileForm());
      const created = await createMealPlan({
        days: draft.days,
        people_count: draft.peopleCount,
        request_text: draft.requestText,
        selected_post_ids: draft.selectedRecipeIds,
        locale,
        user_profile: { ...storedProfile, people_count: peopleCount },
      });
      mealPlan.clear();
      router.push(`/meal-plans/${created.plan_id}`);
    } catch (cause: unknown) {
      setError(errorMessage(cause, isZh ? "创建计划失败" : "Could not create plan"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="site-container plan-entry">
      <Link href="/meal-plans" className="inline-flex items-center text-sm font-medium text-[var(--muted-text)] hover:text-[var(--text)]">
        ← {isZh ? "返回计划" : "Back to plans"}
      </Link>
      <header className="page-header">
        <div>
          <p className="eyebrow">{isZh ? "吃饭计划" : "Meal plans"}</p>
          <h1 className="page-heading">{isZh ? "安排接下来几天" : "Plan the next few days"}</h1>
          <p className="page-description">{isZh ? "写一句想吃什么，或先选几道菜。" : "Write what you want, or start with a few recipes."}</p>
        </div>
      </header>

      <form onSubmit={submit} className="plan-entry-grid mt-8">
        <div className="plan-entry-main">
          <section className="plan-entry-section">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2>{isZh ? "已选菜谱" : "Selected recipes"}</h2>
                <p>{isZh ? "剩下的天数交给规划。" : "The plan will fill the remaining days."}</p>
              </div>
              <Link href="/discover" className="button-secondary h-9 min-h-9 shrink-0"><Plus size={15} />{isZh ? "继续选菜" : "Add recipes"}</Link>
            </div>
            {mealPlan.selected.length ? (
              <ul className="plan-selected-list">
                {mealPlan.selected.map((item) => (
                  <li key={item.id}>
                    <div className="plan-selected-image"><RemoteImage src={item.image_url} alt={item.title} className="h-full w-full object-cover" /></div>
                    <div className="min-w-0">
                      <Link href={`/packs/${item.id}`} className="block truncate font-semibold hover:text-[var(--brand-hover)]">{item.title}</Link>
                      <span className="meta-text">{item.cook_time_minutes} {isZh ? "分钟" : "min"}</span>
                    </div>
                    <button type="button" className="button-quiet h-8 min-h-8 px-2" onClick={() => mealPlan.remove(item.id)} aria-label={isZh ? `移除 ${item.title}` : `Remove ${item.title}`}><X size={16} /></button>
                  </li>
                ))}
              </ul>
            ) : <div className="mt-5 border-y border-dashed border-[var(--line)] py-6 text-sm text-[var(--muted-text)]">{isZh ? "还没选菜，写一句想吃什么即可。" : "No recipes selected. A short description is enough."}</div>}
          </section>

          <section className="plan-entry-section grid gap-5 sm:grid-cols-2">
            <label>
              <span className="block text-sm font-semibold">{isZh ? "规划几天" : "Number of days"}</span>
              <select className="input mt-2" value={days} onChange={(event) => setDays(Number(event.target.value))}>
                {[2, 3, 4, 5, 6, 7].map((value) => <option key={value} value={value}>{value} {isZh ? "天" : "days"}</option>)}
              </select>
            </label>
            <label>
              <span className="block text-sm font-semibold">{isZh ? "几个人吃" : "People"}</span>
              <select className="input mt-2" value={peopleCount} onChange={(event) => setPeopleCount(Number(event.target.value))}>
                {[1, 2, 3, 4, 5, 6, 8, 10, 12].map((value) => <option key={value} value={value}>{value} {isZh ? "人" : "people"}</option>)}
              </select>
            </label>
          </section>

          <section className="plan-entry-section">
            <label htmlFor="meal-plan-request">
              <span className="block text-sm font-semibold">{isZh ? "想吃什么，有什么限制" : "What are you craving?"}</span>
              <span className="mt-1 block text-sm text-[var(--muted-text)]">{isZh ? "可以说口味、忌口、时间、厨具或已有食材。" : "Add taste, dietary needs, time, equipment, or ingredients on hand."}</span>
            </label>
            <textarea id="meal-plan-request" className="textarea mt-3 min-h-36" value={requestText} onChange={(event) => setRequestText(event.target.value)} maxLength={1500} placeholder={isZh ? "例如：接下来 5 天想吃家常中餐，少盐，周三加班要特别快，冰箱里还有半颗卷心菜……" : "Describe your preferences and constraints…"} />
            <div className="mt-3 flex flex-wrap gap-2">
              {EXAMPLES.map((example) => <button key={example} type="button" className="meal-plan-example" onClick={() => setRequestText(example)}>{example}</button>)}
            </div>
          </section>

          <div className="border-t border-[var(--line)] pt-6">
            {error && <p className="mb-4 text-sm text-[var(--danger)]" role="alert">{error}</p>}
            <button type="submit" className="button-primary min-w-40" disabled={submitting}>
              {submitting ? <Loader2 size={17} className="animate-spin" /> : <CalendarDays size={17} />}
              {submitting ? (isZh ? "正在整理菜单" : "Building plan") : (isZh ? "生成多日菜单" : "Build meal plan")}
            </button>
          </div>
        </div>

        <aside className="plan-entry-aside">
          <h2>{isZh ? "这份计划会包含" : "Your plan will include"}</h2>
          <p>{isZh ? "每天的菜、食材、步骤和采购清单。" : "Daily recipes, ingredients, steps, and a shopping list."}</p>
          <ul className="mt-5 space-y-3 border-t border-[var(--line)] pt-4 text-sm">
            <li>01　{isZh ? "按你的天数排菜单" : "A menu for your days"}</li>
            <li>02　{isZh ? "检查时间和限制" : "Time and constraint checks"}</li>
            <li>03　{isZh ? "随时继续修改" : "Conversation-based edits"}</li>
          </ul>
        </aside>
      </form>
    </div>
  );
}
