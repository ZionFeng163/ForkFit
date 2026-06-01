"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, AlertTriangle, CheckCircle2, Clock, DollarSign,
  Loader2, Send, XCircle, Bookmark, BookmarkCheck,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Link, useRouter } from "@/i18n/routing";
import { getRun, publishRun, saveRun, unsaveRun } from "@/lib/api";
import { ImageUpload } from "@/components/image-upload";
import type { RunResultPayload } from "@/types/forkfit";

export function RunView({ runId }: { runId: string }) {
  const t = useTranslations("Run");
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["run", runId],
    queryFn: () => getRun(runId),
  });

  // SSE: subscribe to real-time updates, fall back to polling if SSE unavailable
  useEffect(() => {
    const status = query.data?.status;
    if (status === "succeeded" || status === "failed" || status === "cancelled") return;

    let es: EventSource | null = null;
    try {
      const token = localStorage.getItem("forkfit.auth.token") || "";
      es = new EventSource(`/api/backend/runs/${runId}/stream?token=${encodeURIComponent(token)}`);
      es.onmessage = () => {
        queryClient.invalidateQueries({ queryKey: ["run", runId] });
      };
      es.onerror = () => {
        es?.close();
      };
    } catch {
      // SSE not available — no action, React Query won't refetch either
    }

    return () => { es?.close(); };
  }, [runId, query.data?.status, queryClient]);

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
        <ForkProgress run={run} />
      ) : null}

      {run?.status === "failed" ? (
        <FailedView error={run.error?.message ?? t("failedFallback")} result={run.result} />
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
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [images, setImages] = useState<string[]>([]);

  if (!result) return null;

  const forked = result.forked_meal_pack;
  const firstMeal = forked.meals[0];

  // Editable state — use meal data, not workflow summary
  const [title, setTitle] = useState(forked.title || firstMeal?.name || "");
  const mealDesc = firstMeal
    ? [firstMeal.name, firstMeal.ingredients.slice(0, 5).join(" "), firstMeal.notes].filter(Boolean).join(" — ")
    : "";
  const [description, setDescription] = useState(mealDesc || result.summary || "");
  const [ingredients, setIngredients] = useState(firstMeal?.ingredients.join(", ") || "");
  const [equipment, setEquipment] = useState(firstMeal?.equipment.join(", ") || "");
  const [cookTime, setCookTime] = useState(String(firstMeal?.cook_time_minutes || 30));
  const [cost, setCost] = useState(String(firstMeal?.estimated_cost || 10));
  const [tags, setTags] = useState(firstMeal?.tags.join(", ") || "");
  const [notes, setNotes] = useState(firstMeal?.notes || "");
  const [steps, setSteps] = useState(firstMeal?.steps || []);

  function handlePublish() {
    setPublishing(true);
    const payload = {
      title,
      description,
      image_urls: images,
      recipe_name: title,
      ingredients: ingredients.split(",").map((s) => s.trim()).filter(Boolean),
      equipment: equipment.split(",").map((s) => s.trim()).filter(Boolean),
      cook_time_minutes: Number(cookTime) || 30,
      estimated_cost: Number(cost) || 10,
      tags: tags.split(",").map((s) => s.trim()).filter(Boolean),
      notes,
      steps,
    };
    publishRun(runId, payload).then((post) => {
      setPublished(true);
      setPublishing(false);
      setTimeout(() => router.push(`/packs/${post.id}`), 1500);
    }).catch(() => setPublishing(false));
  }

  function handleSave() {
    setSaving(true);
    const action = saved ? unsaveRun : saveRun;
    action(runId).then(() => {
      setSaved(!saved);
      setSaving(false);
    }).catch(() => setSaving(false));
  }

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

        {/* Cooking steps — editable */}
        <div className="rounded-lg border border-[#e4ded6] bg-white p-5">
          <h3 className="text-sm font-medium text-[#2f2a24]">{t("cookingSteps")}</h3>
          {steps.length > 0 ? (
            <ol className="mt-3 space-y-2 text-sm text-[#625b52]">
              {steps.map((step, i) => (
                <li key={i} className="flex gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#f5f0ea] text-xs font-medium text-[#7b6f61]">
                    {i + 1}
                  </span>
                  <input
                    value={step}
                    onChange={(e) => {
                      const newSteps = [...steps];
                      newSteps[i] = e.target.value;
                      setSteps(newSteps);
                    }}
                    className="flex-1 border-0 bg-transparent text-sm text-[#625b52] focus:outline-none focus:ring-0 p-0"
                  />
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-2 text-xs text-[#9f9890]">{t("noSteps")}</p>
          )}
        </div>

        {/* Image upload */}
        <div className="rounded-lg border border-[#e4ded6] bg-white p-5">
          <h3 className="text-sm font-medium text-[#2f2a24]">{t("addImages")}</h3>
          <p className="mt-1 text-xs text-[#7a7167]">{t("addImagesHelp")}</p>
          <div className="mt-3">
            <ImageUpload images={images} onChange={setImages} maxImages={4} />
          </div>
        </div>

        {/* Actions: Save + Publish */}
        <div className="rounded-lg border border-[#e4ded6] bg-white p-5 space-y-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className={`flex w-full items-center justify-center gap-2 rounded-md border px-4 py-2.5 text-sm font-medium transition-colors ${
              saved
                ? "border-[#2f6b45] bg-[#f0faf3] text-[#2f6b45] hover:bg-[#e0f5e8]"
                : "border-[#d8d0c6] bg-white text-[#625b52] hover:text-[#1f1f1f]"
            }`}
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}
            {saved ? t("savedToForks") : t("saveAsFork")}
          </button>
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
        {/* Full before/after comparison table */}
        <section className="rounded-lg border border-[#e4ded6] bg-white p-5">
          <h2 className="text-base font-semibold text-[#2f2a24]">{t("substitutions")}</h2>
          <p className="mt-1 text-xs text-[#7a7167]">{t("editHint")}</p>

          {(() => {
            const original = result.original_meal_pack.meals[0];
            const forked = result.forked_meal_pack.meals[0];
            if (!original || !forked) return null;

            // Build comparison rows: always show these key fields
            const rows: { label: string; original: string; forked: string; changed: boolean; reason?: string }[] = [];

            // Find change reason by affected_item
            const findReason = (item: string) =>
              result.change_log.find((c) => c.affected_item === item)?.reason;

            const formatVal = (v: unknown): string => {
              if (Array.isArray(v)) return v.length ? v.join(", ") : "—";
              if (v === "" || v === null || v === undefined) return "—";
              return String(v);
            };

            // Title
            rows.push({
              label: t("fieldTitle"),
              original: result.original_meal_pack.title,
              forked: result.forked_meal_pack.title,
              changed: result.original_meal_pack.title !== result.forked_meal_pack.title,
              reason: findReason("title"),
            });

            // Meal name
            rows.push({
              label: t("fieldName", { defaultValue: "meal name" }),
              original: original.name,
              forked: forked.name,
              changed: original.name !== forked.name,
              reason: findReason("meal name"),
            });

            // Ingredients
            rows.push({
              label: t("fieldIngredients"),
              original: formatVal(original.ingredients),
              forked: formatVal(forked.ingredients),
              changed: JSON.stringify(original.ingredients) !== JSON.stringify(forked.ingredients),
              reason: findReason("ingredients"),
            });

            // Equipment
            rows.push({
              label: t("fieldEquipment"),
              original: formatVal(original.equipment),
              forked: formatVal(forked.equipment),
              changed: JSON.stringify(original.equipment) !== JSON.stringify(forked.equipment),
              reason: findReason("equipment"),
            });

            // Cook time
            rows.push({
              label: t("fieldCookTime"),
              original: `${original.cook_time_minutes} min`,
              forked: `${forked.cook_time_minutes} min`,
              changed: original.cook_time_minutes !== forked.cook_time_minutes,
              reason: findReason("cook_time_minutes"),
            });

            // Cost
            rows.push({
              label: t("fieldCost"),
              original: `$${original.estimated_cost}`,
              forked: `$${forked.estimated_cost}`,
              changed: original.estimated_cost !== forked.estimated_cost,
              reason: findReason("estimated_cost"),
            });

            // Tags
            rows.push({
              label: t("fieldTags"),
              original: formatVal(original.tags),
              forked: formatVal(forked.tags),
              changed: JSON.stringify(original.tags) !== JSON.stringify(forked.tags),
              reason: findReason("tags"),
            });

            // Notes
            rows.push({
              label: t("fieldNotes"),
              original: original.notes || "—",
              forked: forked.notes || "—",
              changed: original.notes !== forked.notes,
              reason: findReason("notes"),
            });

            return (
              <div className="mt-3 overflow-hidden rounded-md border border-[#e4ded6]">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-[#f9f7f4] text-left text-[#6f6a61]">
                      <th className="px-3 py-2 font-medium w-[25%]">{t("item")}</th>
                      <th className="px-3 py-2 font-medium w-[30%]">{t("original")}</th>
                      <th className="px-3 py-2 font-medium w-[30%]">{t("forked")}</th>
                      <th className="px-3 py-2 font-medium w-[15%] text-center">✦</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr
                        key={i}
                        className={`border-t border-[#f0ebe4] transition-colors ${
                          r.changed
                            ? "bg-[#f0faf3] border-l-2 border-l-[#2f6b45]"
                            : "opacity-60"
                        }`}
                      >
                        <td className={`px-3 py-2 font-medium ${r.changed ? "text-[#2f2a24]" : "text-[#9f9890]"}`}>{r.label}</td>
                        <td className="px-3 py-2 text-[#9f9890]">
                          <span className={r.changed ? "line-through decoration-[#c4a] decoration-1" : ""}>{r.original}</span>
                        </td>
                        <td className={`px-3 py-2 ${r.changed ? "text-[#1a5c35] font-semibold" : "text-[#2f2a24]"}`}>{r.forked}</td>
                        <td className="px-3 py-2 text-center">
                          {r.changed ? (
                            <span className="inline-block rounded-full bg-[#d4edda] px-2 py-0.5 text-[10px] font-medium text-[#1a5c35]">
                              {t("changed")}
                            </span>
                          ) : (
                            <span className="text-[#d4cfc8]">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}

          {/* Change reasons */}
          {result.change_log.length > 0 ? (
            <div className="mt-4 space-y-2 border-t border-[#f0ebe4] pt-3">
              {result.change_log.map((c, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <span className="mt-0.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[#2f6b45]" />
                  <p className="text-[#5a5249]">
                    <span className="font-medium text-[#2f2a24]">{c.affected_item}:</span>{" "}
                    <span className="text-[#7a7167]">{c.reason}</span>
                  </p>
                </div>
              ))}
            </div>
          ) : null}
        </section>

        {result.unresolved_items.length > 0 ? (
          <section className="rounded-lg border border-[#e8a9a0] bg-[#fff8f5] p-5">
            <h2 className="text-base font-semibold text-[#7f3525]">{t("unresolvedItems")}</h2>
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

function FailedView({ error, result }: { error: string; result?: NonNullable<ReturnType<typeof getRun> extends Promise<infer R> ? R : never>["result"] }) {
  const t = useTranslations("Run");

  // Parse bold markers from error message
  const renderError = (msg: string) => {
    const parts = msg.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={i} className="font-semibold text-[#7f3525]">{part.slice(2, -2)}</strong>;
      }
      return <span key={i}>{part}</span>;
    });
  };

  return (
    <div className="space-y-5">
      {/* Error banner */}
      <div className="flex items-start gap-3 rounded-lg border border-[#e8a9a0] bg-[#fff8f5] p-5">
        <XCircle size={18} className="mt-0.5 shrink-0 text-[#7f3525]" />
        <div className="flex-1">
          <h2 className="font-semibold text-[#7f3525]">{t("failed")}</h2>
          <p className="mt-1 text-sm leading-6 text-[#7f3525] whitespace-pre-line">{renderError(error)}</p>
          <div className="mt-3 flex gap-2">
            <Link
              href="/"
              className="inline-flex items-center gap-1 rounded-md bg-white border border-[#e8a9a0] px-3 py-1.5 text-xs font-medium text-[#7f3525] hover:bg-[#fff0ed]"
            >
              {t("tryAnother")}
            </Link>
          </div>
        </div>
      </div>

      {/* Show comparison table if result is available */}
      {result != null ? (
        <ComparisonTable result={result} />
      ) : null}
    </div>
  );
}

function ComparisonTable({ result }: { result: RunResultPayload }) {
  const t = useTranslations("Run");

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      {/* Left column — forked result (editable if succeeded, read-only if failed) */}
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

        {(() => {
          const forked = result.forked_meal_pack;
          const firstMeal = forked.meals[0];
          if (!firstMeal) return null;

          return (
            <div className="rounded-lg border border-[#e4ded6] bg-white p-5 space-y-4">
              <Field label={t("fieldTitle")}>
                <input value={forked.title || firstMeal.name} readOnly className="input bg-[#fafafa]" />
              </Field>
              <Field label={t("fieldIngredients")}>
                <textarea value={firstMeal.ingredients.join(", ")} readOnly rows={3} className="textarea bg-[#fafafa]" />
              </Field>
              <Field label={t("fieldEquipment")}>
                <input value={firstMeal.equipment.join(", ") || "—"} readOnly className="input bg-[#fafafa]" />
              </Field>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label={t("fieldCookTime")}>
                  <input value={`${firstMeal.cook_time_minutes} min`} readOnly className="input bg-[#fafafa]" />
                </Field>
                <Field label={t("fieldCost")}>
                  <input value={`$${firstMeal.estimated_cost}`} readOnly className="input bg-[#fafafa]" />
                </Field>
                <Field label={t("fieldTags")}>
                  <input value={firstMeal.tags.join(", ") || "—"} readOnly className="input bg-[#fafafa]" />
                </Field>
              </div>
              <Field label={t("fieldNotes")}>
                <textarea value={firstMeal.notes || "—"} readOnly rows={4} className="textarea bg-[#fafafa]" />
              </Field>
            </div>
          );
        })()}
      </section>

      {/* Right column — comparison & info */}
      <aside className="space-y-4">
        <section className="rounded-lg border border-[#e4ded6] bg-white p-5">
          <h2 className="text-base font-semibold text-[#2f2a24]">{t("substitutions")}</h2>

          {(() => {
            const original = result.original_meal_pack.meals[0];
            const forked = result.forked_meal_pack.meals[0];
            if (!original || !forked) return null;

            const rows: { label: string; original: string; forked: string; changed: boolean }[] = [];
            const formatVal = (v: unknown): string => {
              if (Array.isArray(v)) return v.length ? v.join(", ") : "—";
              if (v === "" || v === null || v === undefined) return "—";
              return String(v);
            };

            rows.push({ label: t("fieldTitle"), original: result.original_meal_pack.title, forked: result.forked_meal_pack.title, changed: result.original_meal_pack.title !== result.forked_meal_pack.title });
            rows.push({ label: t("fieldName", { defaultValue: "meal name" }), original: original.name, forked: forked.name, changed: original.name !== forked.name });
            rows.push({ label: t("fieldIngredients"), original: formatVal(original.ingredients), forked: formatVal(forked.ingredients), changed: JSON.stringify(original.ingredients) !== JSON.stringify(forked.ingredients) });
            rows.push({ label: t("fieldEquipment"), original: formatVal(original.equipment), forked: formatVal(forked.equipment), changed: JSON.stringify(original.equipment) !== JSON.stringify(forked.equipment) });
            rows.push({ label: t("fieldCookTime"), original: `${original.cook_time_minutes} min`, forked: `${forked.cook_time_minutes} min`, changed: original.cook_time_minutes !== forked.cook_time_minutes });
            rows.push({ label: t("fieldCost"), original: `$${original.estimated_cost}`, forked: `$${forked.estimated_cost}`, changed: original.estimated_cost !== forked.estimated_cost });
            rows.push({ label: t("fieldTags"), original: formatVal(original.tags), forked: formatVal(forked.tags), changed: JSON.stringify(original.tags) !== JSON.stringify(forked.tags) });
            rows.push({ label: t("fieldNotes"), original: original.notes || "—", forked: forked.notes || "—", changed: original.notes !== forked.notes });

            return (
              <div className="mt-3 overflow-hidden rounded-md border border-[#e4ded6]">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-[#f9f7f4] text-left text-[#6f6a61]">
                      <th className="px-3 py-2 font-medium w-[25%]">{t("item")}</th>
                      <th className="px-3 py-2 font-medium w-[30%]">{t("original")}</th>
                      <th className="px-3 py-2 font-medium w-[30%]">{t("forked")}</th>
                      <th className="px-3 py-2 font-medium w-[15%] text-center">✦</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr
                        key={i}
                        className={`border-t border-[#f0ebe4] transition-colors ${
                          r.changed
                            ? "bg-[#f0faf3] border-l-2 border-l-[#2f6b45]"
                            : "opacity-60"
                        }`}
                      >
                        <td className={`px-3 py-2 font-medium ${r.changed ? "text-[#2f2a24]" : "text-[#9f9890]"}`}>{r.label}</td>
                        <td className="px-3 py-2 text-[#9f9890]"><span className={r.changed ? "line-through decoration-[#c4a] decoration-1" : ""}>{r.original}</span></td>
                        <td className={`px-3 py-2 ${r.changed ? "text-[#1a5c35] font-semibold" : "text-[#2f2a24]"}`}>{r.forked}</td>
                        <td className="px-3 py-2 text-center">
                          {r.changed ? <span className="inline-block rounded-full bg-[#d4edda] px-2 py-0.5 text-[10px] font-medium text-[#1a5c35]">{t("changed")}</span> : <span className="text-[#d4cfc8]">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}

          {result.change_log.length > 0 ? (
            <div className="mt-4 space-y-2 border-t border-[#f0ebe4] pt-3">
              {result.change_log.map((c, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <span className="mt-0.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[#2f6b45]" />
                  <p className="text-[#5a5249]">
                    <span className="font-medium text-[#2f2a24]">{c.affected_item}:</span>{" "}
                    <span className="text-[#7a7167]">{c.reason}</span>
                  </p>
                </div>
              ))}
            </div>
          ) : null}
        </section>

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

const FORK_STEPS = [
  { node: "load_input", labelKey: "stepLoading" },
  { node: "user_agent", labelKey: "stepAnalyzing" },
  { node: "reviewer_agents", labelKey: "stepChecking" },
  { node: "adapter_agent", labelKey: "stepAdapting" },
  { node: "cooking_steps", labelKey: "stepCooking" },
  { node: "final_validation", labelKey: "stepValidating" },
];

function ForkProgress({ run }: { run: { status: string; trace?: { steps: { node: string; status: string }[] } | null } }) {
  const t = useTranslations("Run");
  const traceSteps = run.trace?.steps || [];
  const completedNodes = new Set(traceSteps.filter(s => s.status === "success").map(s => s.node));

  // Determine current step: last completed + 1
  const currentIdx = FORK_STEPS.findIndex(s => !completedNodes.has(s.node));
  const isRunning = run.status === "running" || run.status === "queued";

  return (
    <div className="rounded-lg border border-[#e4ded6] bg-white p-5">
      <div className="flex items-center gap-3 mb-4">
        <Loader2 size={18} className="animate-spin text-[#625b52]" />
        <h2 className="font-semibold text-[#2f2a24]">{t("forkInProgress")}</h2>
      </div>
      <div className="space-y-3">
        {FORK_STEPS.map((step, i) => {
          const done = completedNodes.has(step.node);
          const active = isRunning && i === currentIdx;
          return (
            <div key={step.node} className="flex items-center gap-3">
              <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
                done ? "bg-[#2f6b45] text-white"
                : active ? "bg-[#e8f5e9] text-[#2f6b45] ring-2 ring-[#2f6b45] ring-offset-1"
                : "bg-[#f0ebe4] text-[#9f9890]"
              }`}>
                {done ? "✓" : i + 1}
              </div>
              <span className={`text-sm ${done ? "text-[#2f2a24]" : active ? "font-medium text-[#2f2a24]" : "text-[#9f9890]"}`}>
                {t(step.labelKey)}
              </span>
              {active && <Loader2 size={14} className="animate-spin text-[#2f6b45]" />}
            </div>
          );
        })}
      </div>
    </div>
  );
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
