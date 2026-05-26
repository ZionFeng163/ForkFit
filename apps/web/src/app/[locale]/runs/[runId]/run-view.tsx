"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/routing";
import { getRun } from "@/lib/api";

export function RunView({ runId }: { runId: string }) {
  const t = useTranslations("Run");
  const query = useQuery({
    queryKey: ["run", runId],
    queryFn: () => getRun(runId),
    refetchInterval: (queryState) => {
      const status = queryState.state.data?.status;
      return status === "queued" || status === "running" ? 1500 : false;
    },
  });

  const run = query.data;

  return (
    <div className="space-y-6">
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-sm text-[#625b52] hover:text-[#1f1f1f]"
      >
        <ArrowLeft size={16} />
        {t("back")}
      </Link>

      <div>
        <h1 className="text-2xl font-semibold tracking-0">{t("title")}</h1>
        <p className="mt-2 break-all text-sm leading-6 text-[#625b52]">{runId}</p>
      </div>

      {query.isLoading ? (
        <StatusPanel icon={<Loader2 size={18} className="animate-spin" />} title={t("loading")} />
      ) : null}

      {query.error ? (
        <StatusPanel
          icon={<XCircle size={18} />}
          title={t("couldNotLoad")}
          message={query.error.message}
        />
      ) : null}

      {run && (run.status === "queued" || run.status === "running") ? (
        <StatusPanel
          icon={<Loader2 size={18} className="animate-spin" />}
          title={run.status === "queued" ? t("queued") : t("running")}
          message={t("workerMessage")}
        />
      ) : null}

      {run?.status === "failed" ? (
        <StatusPanel
          icon={<XCircle size={18} />}
          title={t("failed")}
          message={run.error?.message ?? t("failedFallback")}
        />
      ) : null}

      {run?.status === "succeeded" && run.result ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section className="rounded-lg border border-[#e4ded6] bg-white p-5">
            <div className="flex items-start gap-3">
              <CheckCircle2 size={20} className="mt-1 text-[#2f6b45]" />
              <div>
                <h2 className="text-xl font-semibold">{t("adaptedPack")}</h2>
                <p className="mt-1 text-sm leading-6 text-[#625b52]">
                  {run.result.summary}
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-4">
              {run.result.forked_meal_pack.meals.map((meal) => (
                <article
                  key={meal.id}
                  className="rounded-lg border border-[#e8e1d8] p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-semibold">{meal.name}</h3>
                    </div>
                    <p className="text-sm text-[#625b52]">
                      {meal.cook_time_minutes}m
                    </p>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[#625b52]">
                    {meal.ingredients.join(", ")}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[#625b52]">
                    {t("equipment")}: {meal.equipment.length ? meal.equipment.join(", ") : t("none")}
                  </p>
                </article>
              ))}
            </div>
          </section>

          <aside className="space-y-4">
            <section className="rounded-lg border border-[#e4ded6] bg-white p-5">
              <h2 className="text-lg font-semibold">{t("changeLog")}</h2>
              <div className="mt-4 space-y-3">
                {run.result.change_log.length ? (
                  run.result.change_log.map((change, index) => (
                    <div key={`${change.affected_item}-${index}`} className="text-sm">
                      <p className="font-medium">{change.affected_item}</p>
                      <p className="mt-1 leading-6 text-[#625b52]">
                        {change.from_value} → {change.to_value}
                      </p>
                      <p className="mt-1 leading-6 text-[#7a7167]">
                        {change.reason}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-[#625b52]">{t("noChanges")}</p>
                )}
              </div>
            </section>

            <section className="rounded-lg border border-[#e4ded6] bg-white p-5">
              <h2 className="text-lg font-semibold">{t("finalReview")}</h2>
              <p className="mt-2 text-sm text-[#625b52]">
                {run.result.final_review.agent}: {run.result.final_review.status}
              </p>
              {run.trace ? (
                <p className="mt-3 text-sm text-[#625b52]">
                  {t("traceSummary", {
                    llmCalls: run.trace.llm_calls.length,
                    steps: run.trace.steps.length,
                  })}
                </p>
              ) : null}
            </section>
          </aside>
        </div>
      ) : null}
    </div>
  );
}

function StatusPanel({
  icon,
  title,
  message,
}: {
  icon: React.ReactNode;
  title: string;
  message?: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-[#e4ded6] bg-white p-5">
      <div className="mt-0.5 text-[#625b52]">{icon}</div>
      <div>
        <h2 className="font-semibold">{title}</h2>
        {message ? (
          <p className="mt-1 text-sm leading-6 text-[#625b52]">{message}</p>
        ) : null}
      </div>
    </div>
  );
}
