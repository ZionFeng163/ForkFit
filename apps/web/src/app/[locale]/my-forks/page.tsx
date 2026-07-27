"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Loader2, Plus, SlidersHorizontal, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { AppShell } from "@/components/app-shell";
import { AuthGuard } from "@/components/auth-guard";
import { ConfirmModal } from "@/components/confirm-modal";
import { useAuth } from "@/components/auth-provider";
import { Link } from "@/i18n/routing";
import { listSavedRuns, unsaveRun } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import type { RunStatusResponse } from "@/types/forkfit";

type Filter = "all" | "succeeded" | "active" | "failed";

function runTitle(run: RunStatusResponse) {
  return run.result?.forked_meal_pack?.title || run.result?.forked_meal_pack?.meals?.[0]?.name || run.result?.original_meal_pack?.title || `定制 ${run.run_id.slice(0, 8)}`;
}

function statusLabel(status: RunStatusResponse["status"]) {
  if (status === "succeeded") return "已完成";
  if (status === "queued") return "排队中";
  if (status === "running") return "进行中";
  if (status === "failed") return "失败";
  if (status === "needs_input") return "等待确认";
  return status;
}

export default function MyForksPage() {
  const t = useTranslations("MyForks");
  const { user } = useAuth();
  const [runs, setRuns] = useState<RunStatusResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    listSavedRuns().then(setRuns).catch((reason: Error) => setError(reason.message)).finally(() => setLoading(false));
  }, [user]);

  async function confirmRemove() {
    if (!deleteTarget) return;
    try {
      await unsaveRun(deleteTarget);
      setRuns((current) => current.filter((run) => run.run_id !== deleteTarget));
      setDeleteTarget(null);
    } catch (reason: unknown) {
      setError(errorMessage(reason, "移除失败，请稍后重试"));
    }
  }

  const filtered = runs.filter((run) => {
    if (filter === "all") return true;
    if (filter === "active") return run.status === "queued" || run.status === "running" || run.status === "needs_input";
    return run.status === filter;
  });
  const completed = runs.filter((run) => run.status === "succeeded").length;
  const active = runs.filter((run) => run.status === "queued" || run.status === "running" || run.status === "needs_input").length;
  const failed = runs.filter((run) => run.status === "failed").length;

  return (
    <AuthGuard>
      <AppShell>
        <div className="site-container max-w-[920px] pb-20 pt-8">
          <header className="flex flex-wrap items-end justify-between gap-5 border-b border-[var(--line)] pb-6">
            <div><h1 className="page-heading">{t("title")}</h1><p className="mt-2 text-sm text-[var(--muted-text)]">查看保存的定制版本和仍在处理的任务</p></div>
            <Link href="/discover" className="button-primary"><Plus size={16} />开始新定制</Link>
          </header>

          <div className="category-tabs">
            {[
              { key: "all" as const, label: `全部 ${runs.length}` },
              { key: "succeeded" as const, label: `已完成 ${completed}` },
              { key: "active" as const, label: `进行中 ${active}` },
              { key: "failed" as const, label: `失败 ${failed}` },
            ].map((item) => <button key={item.key} type="button" className="category-tab" data-active={filter === item.key} onClick={() => setFilter(item.key)}>{item.label}</button>)}
          </div>

          {error && <div className="status-panel mt-6 border-[var(--danger)] text-sm text-[var(--danger)]">{error}</div>}
          {loading ? (
            <div className="py-20"><Loader2 className="mx-auto animate-spin text-[var(--muted-text)]" /></div>
          ) : filtered.length === 0 ? (
            <div className="py-20 text-center"><SlidersHorizontal className="mx-auto text-[var(--muted-text)]" /><h2 className="mt-4 text-lg font-bold">还没有定制菜谱</h2><p className="mt-2 text-sm text-[var(--muted-text)]">从一道喜欢的菜开始，写下时间、过敏或口味要求。</p><Link href="/discover" className="button-primary mt-5">去发现菜谱</Link></div>
          ) : (
            <div className="divide-y divide-[var(--line)] border-b border-[var(--line)]">
              {filtered.map((run) => {
                const meal = run.result?.forked_meal_pack?.meals?.[0];
                return (
                  <article key={run.run_id} className="grid gap-4 py-5 sm:grid-cols-[1fr_auto] sm:items-center">
                    <div className="min-w-0">
                      <div className={`mb-1 text-xs font-semibold ${run.status === "failed" ? "text-[var(--danger)]" : "text-[var(--brand-hover)]"}`}>{statusLabel(run.status)}</div>
                      <h2 className="truncate text-base font-bold"><Link href={`/runs/${run.run_id}`} className="hover:text-[var(--brand-hover)]">{runTitle(run)}</Link></h2>
                      <p className="mt-1 line-clamp-2 text-sm leading-6 text-[var(--muted-text)]">{run.result?.summary || run.user_message || run.error?.message || "查看本次定制详情"}</p>
                      <div className="mt-2 flex flex-wrap gap-4 text-xs text-[var(--muted-text)]">{meal?.cook_time_minutes ? <span>{meal.cook_time_minutes} 分钟</span> : null}<span>{run.result?.change_log?.length ?? 0} 项调整</span><span>{new Date(run.created_at).toLocaleDateString("zh-CN")}</span></div>
                    </div>
                    <div className="flex gap-2">
                      <Link href={`/runs/${run.run_id}`} className="button-secondary h-9 min-h-9">查看<ArrowRight size={15} /></Link>
                      <button type="button" className="button-secondary h-9 min-h-9 px-3 text-[var(--danger)]" onClick={() => setDeleteTarget(run.run_id)} aria-label="移除"><Trash2 size={15} /></button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
        <ConfirmModal open={Boolean(deleteTarget)} title="移除定制" message="从我的定制中移除这个结果？" confirmLabel="移除" danger onConfirm={confirmRemove} onCancel={() => setDeleteTarget(null)} />
      </AppShell>
    </AuthGuard>
  );
}
