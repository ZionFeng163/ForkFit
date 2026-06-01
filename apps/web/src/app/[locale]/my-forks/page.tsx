"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, GitFork, ArrowRight, Trash2 } from "lucide-react";

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
        <section className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
          <h1 className="mb-6 text-lg font-semibold">{t("title")}</h1>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 size={24} className="animate-spin text-[#9f9890]" />
            </div>
          ) : runs.length === 0 ? (
            <div className="rounded-lg border border-[#e4ded6] bg-white p-8 text-center">
              <GitFork size={32} className="mx-auto mb-3 text-[#d4cfc8]" />
              <p className="text-sm text-[#7a7167]">{t("empty")}</p>
              <Link
                href="/"
                className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-[#2f2a24] hover:underline"
              >
                {t("discover")} <ArrowRight size={14} />
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {runs.map((run) => {
                const forked = run.result?.forked_meal_pack;
                const firstMeal = forked?.meals?.[0];
                return (
                  <div
                    key={run.run_id}
                    className="flex items-center gap-4 rounded-lg border border-[#e4ded6] bg-white p-4 transition-colors hover:bg-[#faf8f5]"
                  >
                    <Link
                      href={`/runs/${run.run_id}`}
                      className="flex min-w-0 flex-1 items-center gap-4"
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#f5f0ea]">
                        <GitFork size={16} className="text-[#7b6f61]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-[#2f2a24] truncate">
                          {firstMeal?.name || forked?.title || run.run_id}
                        </p>
                        <p className="mt-0.5 text-xs text-[#9f9890]">
                          {new Date(run.created_at).toLocaleDateString()} ·{" "}
                          {run.result?.change_log?.length || 0} {t("changes")}
                        </p>
                      </div>
                      <ArrowRight size={16} className="shrink-0 text-[#d4cfc8]" />
                    </Link>
                    <button
                      onClick={() => handleDelete(run.run_id)}
                      disabled={deleting === run.run_id}
                      className="shrink-0 rounded p-1.5 text-[#9f9890] hover:bg-[#fff0ed] hover:text-[#c0392b] transition-colors"
                      title={t("remove")}
                    >
                      {deleting === run.run_id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Trash2 size={14} />
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </AppShell>
    </AuthGuard>
  );
}
