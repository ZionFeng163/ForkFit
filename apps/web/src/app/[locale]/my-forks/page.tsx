"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, GitFork, ArrowRight, Trash2, Plus } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { AuthGuard } from "@/components/auth-guard";
import { useAuth } from "@/components/auth-provider";
import { Link } from "@/i18n/routing";
import { listSavedRuns, unsaveRun } from "@/lib/api";
import type { RunStatusResponse } from "@/types/forkfit";

export default function MyForksPage() {
  const t = useTranslations("MyForks");
  const { user } = useAuth();
  const [runs, setRuns] = useState<RunStatusResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    listSavedRuns()
      .then(setRuns)
      .finally(() => setLoading(false));
  }, [user]);

  function handleDelete(runId: string) {
    setDeleting(runId);
    unsaveRun(runId).then(() => {
      setRuns((prev) => prev.filter((r) => r.run_id !== runId));
    }).finally(() => setDeleting(null));
  }

  return (
    <AuthGuard>
      <AppShell>
        <div className="mx-auto max-w-[960px] px-7 pb-20">
          <div className="pt-8 pb-6" style={{ borderBottom: "1px solid var(--lp-border)" }}>
            <h1 className="text-2xl font-bold tracking-[-0.01em]" style={{ color: "var(--lp-fg)" }}>
              {t("title")}
            </h1>
            <p className="text-sm mt-1" style={{ color: "var(--lp-muted)" }}>
              {runs.length} 个定制菜谱
            </p>
          </div>

          {loading ? (
            <div className="py-20 text-center">
              <Loader2 size={24} className="animate-spin mx-auto" style={{ color: "var(--lp-muted)" }} />
            </div>
          ) : runs.length === 0 ? (
            <div className="py-20 text-center">
              <div className="w-16 h-16 rounded-full grid place-items-center mx-auto mb-4" style={{ background: "var(--lp-warm-100)" }}>
                <GitFork size={28} style={{ color: "var(--lp-muted)" }} />
              </div>
              <h3 className="text-base font-semibold mb-1.5" style={{ color: "var(--lp-fg)" }}>{t("empty")}</h3>
              <Link href="/discover"
                className="inline-flex items-center gap-1.5 mt-3 px-5 py-2.5 rounded-lg text-[13px] font-semibold text-white transition-all duration-150"
                style={{ background: "var(--lp-accent)" }}>
                <Plus size={14} /> 去发现菜谱
              </Link>
            </div>
          ) : (
            <div className="flex flex-col gap-3 mt-6">
              {runs.map((run) => {
                const forked = run.result?.forked_meal_pack;
                const firstMeal = forked?.meals?.[0];
                const changes = run.result?.change_log?.length || 0;
                return (
                  <div key={run.run_id} className="flex items-center gap-4 rounded-xl p-4 transition-all duration-200"
                    style={{ background: "var(--lp-surface)", border: "1px solid var(--lp-border)" }}
                    onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "var(--lp-shadow-sm)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "none"; }}>
                    <Link href={`/runs/${run.run_id}`} className="flex min-w-0 flex-1 items-center gap-4">
                      <div className="w-10 h-10 shrink-0 rounded-xl grid place-items-center" style={{ background: "var(--lp-warm-100)" }}>
                        <GitFork size={16} style={{ color: "var(--lp-muted)" }} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold truncate" style={{ color: "var(--lp-fg)" }}>
                          {firstMeal?.name || forked?.title || run.run_id}
                        </p>
                        <p className="mt-0.5 text-xs" style={{ color: "var(--lp-muted)" }}>
                          {new Date(run.created_at).toLocaleDateString()} · {changes} 个改动
                        </p>
                      </div>
                      <ArrowRight size={16} className="shrink-0" style={{ color: "var(--lp-muted)" }} />
                    </Link>
                    <button onClick={() => handleDelete(run.run_id)} disabled={deleting === run.run_id}
                      className="shrink-0 p-1.5 rounded transition-colors"
                      style={{ color: "var(--lp-muted)" }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = "#c0392b"; e.currentTarget.style.background = "#fef0ef"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = "var(--lp-muted)"; e.currentTarget.style.background = "none"; }}>
                      {deleting === run.run_id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </AppShell>
    </AuthGuard>
  );
}
