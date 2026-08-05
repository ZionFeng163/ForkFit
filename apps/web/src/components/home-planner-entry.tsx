"use client";

import { FormEvent, useState } from "react";
import { ArrowRight, CalendarDays } from "lucide-react";
import { useLocale } from "next-intl";

import { useMealPlanSelection } from "@/components/meal-plan-provider";
import { Link, useRouter } from "@/i18n/routing";

export function HomePlannerEntry() {
  const locale = useLocale();
  const router = useRouter();
  const { selected } = useMealPlanSelection();
  const isZh = locale === "zh";
  const [request, setRequest] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    const value = request.trim();
    router.push(value ? `/meal-plans/new?request_text=${encodeURIComponent(value)}` : "/meal-plans/new");
  }

  return (
    <div className="home-planner-form">
      <form onSubmit={submit}>
        <label htmlFor="home-plan-request">{isZh ? "写下这几天想吃什么" : "Describe the next few days"}</label>
        <textarea
          id="home-plan-request"
          className="textarea"
          value={request}
          onChange={(event) => setRequest(event.target.value)}
          maxLength={1500}
          placeholder={isZh ? "例如：三天家常菜，30 分钟内，清淡一点" : "For example: three easy dinners under 30 minutes"}
        />
        <div className="home-planner-form-actions">
          <button type="submit" className="button-primary">
            <CalendarDays size={16} />
            {isZh ? "开始规划" : "Start planning"}
          </button>
          <Link href="/discover" className="button-secondary">
            {isZh ? "先逛菜谱" : "Browse recipes"}
            <ArrowRight size={16} />
          </Link>
        </div>
      </form>
      {selected.length > 0 && (
        <Link href="/meal-plans/new" className="home-planner-selection">
          <span>{isZh ? `已选 ${selected.length} 道菜` : `${selected.length} recipes selected`}</span>
          <strong>{isZh ? "加入计划" : "Add to plan"} <ArrowRight size={14} /></strong>
        </Link>
      )}
    </div>
  );
}
