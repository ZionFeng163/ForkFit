"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft, AlertTriangle, CheckCircle2, Clock, DollarSign,
  Loader2, Send, XCircle,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Link, useRouter } from "@/i18n/routing";
import { getRun, publishRun } from "@/lib/api";

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

      {query.isLoading ? (
        <StatusPanel icon={<Loader2 size={18} className="animate-spin" />} title={t("loading")} />
      ) : null}

      {query.error ? (
        <StatusPanel icon={<XCircle size={18} />} title={t("couldNotLoad")} message={query.error.message} />
      ) : null}

      {run && (run.status === "queued" || run.status === "running") ? (
        <StatusPanel
          icon={<Loader2 size={18} className="animate-spin" />}
          title={run.status === "queued" ? t("queued") : t("running")}
          message={t("workerMessage")}
        />
      ) : null}

      {run?.status === "failed" ? (
        <StatusPanel icon={<XCircle size={18} />} title={t("failed")} message={run.error?.message ?? t("failedFallback")} />
      ) : null}

      {run?.status === "succeeded" && run.result ? (
        <SucceededView runId={runId} result={run.result} />
      ) : null}
    </div>
  );
}

function SucceededView({ runId, result }: { runId: string; result: NonNullable<ReturnType<typeof getRun> extends Promise<infer R> ? R : never>["result"] }) {
  const t = useTranslations("Run");
  const router = useRouter();
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);

  if (!result) return null;

  const forked = result.forked_meal_pack;
  const firstMeal = forked.meals[0];

  // Editable state
  const [title, setTitle] = useState(forked.title || firstMeal?.name || "");
  const [description, setDescription] = useState(result.summary || "");
  const [ingredients, setIngredients] = useState(firstMeal?.ingredients.join(", ") || "");
  const [equipment, setEquipment] = useState(firstMeal?.equipment.join(", ") || "");
  const [cookTime, setCookTime] = useState(String(firstMeal?.cook_time_minutes || 30));
  const [cost, setCost] = useState(String(firstMeal?.estimated_cost || 10));
  const [tags, setTags] = useState(firstMeal?.tags.join(", ") || "");
  const [notes, setNotes] = useState(firstMeal?.notes || "");

  function handlePublish() {
    setPublishing(true);
    const payload = {
      title,
      description,
      recipe_name: title,
      ingredients: ingredients.split(",").map((s) => s.trim()).filter(Boolean),
      equipment: equipment.split(",").map((s) => s.trim()).filter(Boolean),
      cook_time_minutes: Number(cookTime) || 30,
      estimated_cost: Number(cost) || 10,
      tags: tags.split(",").map((s) => s.trim()).filter(Boolean),
      notes,
    };
    publishRun(runId, payload).then((post) => {
      setPublished(true);
      setTimeout(() => router.push(`/packs/${post.id}`), 1500);
    }).catch(() => setPublishing(false));
  }

  const steps = splitSteps(notes);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      {/* Left column — editable recipe form */}
      <section className="space-y-5">
        <div className="rounded-lg border border-[#e4ded6] bg-white p-5">
          <div className="flex items-start gap-3">
            <CheckCircle2 size={20} className="mt-1 text-[#2f6b45]" />
            <div>
              <h2 className="text-xl font-semibold">{t("adaptedPack")}</h2>
              <p className="mt-1 text-sm leading-6 text-[#625b52]">{t("editHint")}</p>
            </div>
          </div>
        </div>

        {/* Editable fields */}
        <div className="rounded-lg border border-[#e4ded6] bg-white p-5 space-y-4">
          <Field label={t("fieldTitle")}>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="input" />
          </Field>
          <Field label={t("fieldDescription")}>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="textarea" />
          </Field>
          <Field label={t("fieldIngredients")} help={t("commaSeparated")}>
            <textarea value={ingredients} onChange={(e) => setIngredients(e.target.value)} rows={3} className="textarea" />
          </Field>
          <Field label={t("fieldEquipment")} help={t("commaSeparated")}>
            <input value={equipment} onChange={(e) => setEquipment(e.target.value)} className="input" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={t("fieldCookTime")}>
              <input type="number" min="1" value={cookTime} onChange={(e) => setCookTime(e.target.value)} className="input" />
            </Field>
            <Field label={t("fieldCost")}>
              <input type="number" min="0" step="0.1" value={cost} onChange={(e) => setCost(e.target.value)} className="input" />
            </Field>
            <Field label={t("fieldTags")} help={t("commaSeparated")}>
              <input value={tags} onChange={(e) => setTags(e.target.value)} className="input" />
            </Field>
          </div>
          <Field label={t("fieldNotes")}>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} className="textarea" />
          </Field>
        </div>

        {/* Cooking steps preview */}
        {steps.length > 0 ? (
          <div className="rounded-lg border border-[#e4ded6] bg-white p-5">
            <h3 className="text-sm font-medium text-[#2f2a24]">{t("cookingSteps")}</h3>
            <ol className="mt-3 space-y-2 text-sm text-[#625b52]">
              {steps.map((step, i) => (
                <li key={i} className="flex gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#f5f0ea] text-xs font-medium text-[#7b6f61]">
                    {i + 1}
                  </span>
                  <span className="pt-0.5">{step}</span>
                </li>
              ))}
            </ol>
          </div>
        ) : null}

        {/* Publish button */}
        <div className="rounded-lg border border-[#e4ded6] bg-white p-5">
          {published ? (
            <div className="flex items-center gap-2 text-sm text-[#2f6b45]">
              <CheckCircle2 size={16} />
              {t("publishSuccess")}
            </div>
          ) : (
            <Button onClick={handlePublish} disabled={publishing} className="w-full">
              {publishing ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              <span className="ml-2">{t("publishButton")}</span>
            </Button>
          )}
        </div>
      </section>

      {/* Right column — comparison & info */}
      <aside className="space-y-4">
        {/* Substitution table */}
        {result.change_log.length > 0 ? (
          <section className="rounded-lg border border-[#e4ded6] bg-white p-5">
            <h2 className="text-lg font-semibold">{t("substitutions")}</h2>
            <div className="mt-3 overflow-hidden rounded-md border border-[#e4ded6]">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-[#fafafa] text-left text-[#6f6a61]">
                    <th className="px-3 py-2 font-medium">{t("item")}</th>
                    <th className="px-3 py-2 font-medium">{t("original")}</th>
                    <th className="px-3 py-2 font-medium">{t("forked")}</th>
                  </tr>
                </thead>
                <tbody>
                  {result.change_log.map((c, i) => (
                    <tr key={i} className="border-t border-[#f0ebe4]">
                      <td className="px-3 py-2 font-medium">{c.affected_item}</td>
                      <td className="px-3 py-2 text-[#9f9890] line-through">{c.from_value}</td>
                      <td className="px-3 py-2 text-[#2f2a24]">{c.to_value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 space-y-2">
              {result.change_log.map((c, i) => (
                <p key={i} className="text-xs text-[#7a7167]">
                  <span className="font-medium">{c.affected_item}:</span> {c.reason}
                </p>
              ))}
            </div>
          </section>
        ) : null}

        {result.unresolved_items.length > 0 ? (
          <section className="rounded-lg border border-[#e8a9a0] bg-[#fff8f5] p-5">
            <h2 className="text-lg font-semibold text-[#7f3525]">{t("unresolvedItems")}</h2>
            <div className="mt-3 space-y-3">
              {result.unresolved_items.map((item, i) => (
                <div key={i} className="text-sm">
                  <div className="flex items-center gap-2">
                    <AlertTriangle size={14} className="text-[#b8860b]" />
                    <span className="font-medium">{item.message}</span>
                  </div>
                  {item.suggested_action ? (
                    <p className="mt-1 ml-5 text-[#7a7167]">{item.suggested_action}</p>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section className="rounded-lg border border-[#e4ded6] bg-white p-5">
          <h2 className="text-sm font-medium text-[#6f6a61]">{t("originalPost")}</h2>
          <p className="mt-1 text-sm font-medium">{result.original_meal_pack.title}</p>
          <p className="mt-1 text-xs text-[#9f9890]">{result.original_meal_pack.theme}</p>
        </section>

        <section className="rounded-lg border border-[#e4ded6] bg-white p-5">
          <h2 className="text-sm font-medium text-[#6f6a61]">{t("finalReview")}</h2>
          <p className="mt-1 text-sm">{result.final_review.status}</p>
        </section>
      </aside>
    </div>
  );
}

function Field({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1.5 text-sm font-medium">
      <span>{label}</span>
      {children}
      {help ? <span className="block text-xs text-[#7a7167]">{help}</span> : null}
    </label>
  );
}

function splitSteps(notes: string): string[] {
  if (!notes.trim()) return [];
  return notes.split(/[。.！!？?\n]+/).map((s) => s.trim()).filter((s) => s.length > 1);
}

function StatusPanel({ icon, title, message }: { icon: React.ReactNode; title: string; message?: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-[#e4ded6] bg-white p-5">
      <div className="mt-0.5 text-[#625b52]">{icon}</div>
      <div>
        <h2 className="font-semibold">{title}</h2>
        {message ? <p className="mt-1 text-sm leading-6 text-[#625b52]">{message}</p> : null}
      </div>
    </div>
  );
}
