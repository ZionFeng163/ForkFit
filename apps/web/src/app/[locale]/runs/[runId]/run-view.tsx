"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft, AlertTriangle, CheckCircle2,
  Loader2, Send, XCircle, Bookmark, BookmarkCheck, Share2,
  ExternalLink, Plus, X,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Link, useRouter } from "@/i18n/routing";
import { getRun, publishRun, resolveRun, saveRun, unsaveRun } from "@/lib/api";
import { ImageUpload } from "@/components/image-upload";
import type { RunResultPayload } from "@/types/forkfit";

export function RunView({ runId }: { runId: string }) {
  const t = useTranslations("Run");

  const query = useQuery({
    queryKey: ["run", runId],
    queryFn: () => getRun(runId),
    refetchInterval: (query) => {
      const s = query.state.data?.status;
      return s === "running" || s === "queued" ? 300 : false;
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
        <ForkProgress run={run} />
      ) : null}

      {run?.status === "failed" ? (
        <FailedView error={run.error?.message ?? t("failedFallback")} result={run.result} />
      ) : null}

      {run?.status === "needs_input" ? (
        <NeedsInputView runId={runId} unresolved={run as any} />
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

  const [title, setTitle] = useState(forked.title || firstMeal?.name || "");
  const [description, setDescription] = useState(result.description || result.summary || "");
  const [ingredients, setIngredients] = useState(firstMeal?.ingredients.join(", ") || "");
  const [equipment, setEquipment] = useState(firstMeal?.equipment.join(", ") || "");
  const [cookTime, setCookTime] = useState(String(firstMeal?.cook_time_minutes || 30));
  const [cost, setCost] = useState(String(firstMeal?.estimated_cost || 10));
  const [tags, setTags] = useState(firstMeal?.tags.join(", ") || "");
  const [notes, setNotes] = useState(firstMeal?.notes || "");
  const [steps, setSteps] = useState(firstMeal?.steps || []);

  function splitList(s: string) {
    return s.split(/[,，]/).map((x) => x.trim()).filter(Boolean);
  }

  function handlePublish() {
    setPublishing(true);
    const payload = {
      title,
      description,
      image_urls: images,
      recipe_name: title,
      ingredients: splitList(ingredients),
      equipment: splitList(equipment),
      cook_time_minutes: Number(cookTime) || 30,
      tags: splitList(tags),
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
          <p className="text-xs text-[#9f9890]">{t("commaSeparated")}</p>
          <Field label={t("fieldIngredients")}>
            <textarea value={ingredients} onChange={(e) => setIngredients(e.target.value)} rows={3} className="textarea" />
          </Field>
          <Field label={t("fieldEquipment")}>
            <input value={equipment} onChange={(e) => setEquipment(e.target.value)} className="input" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("fieldCookTime")}>
              <input type="number" min="1" value={cookTime} onChange={(e) => setCookTime(e.target.value)} className="input" />
            </Field>
            <Field label={t("fieldTags")}>
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
                <li key={i} className="flex items-start gap-2">
                  <span className="mt-1.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#f5f0ea] text-xs font-medium text-[#7b6f61]">
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
                  <button
                    type="button"
                    onClick={() => setSteps(steps.filter((_, j) => j !== i))}
                    className="mt-1 shrink-0 rounded p-0.5 text-[#9f9890] hover:bg-[#f5f0ea] hover:text-[#7f3525]"
                    title={t("removeStep")}
                  >
                    <X size={14} />
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-2 text-xs text-[#9f9890]">{t("noSteps")}</p>
          )}
          <button
            type="button"
            onClick={() => setSteps([...steps, ""])}
            className="mt-3 flex items-center gap-1.5 text-xs font-medium text-[#625b52] hover:text-[#2f2a24]"
          >
            <Plus size={14} />
            {t("addStep")}
          </button>
        </div>

        {/* Image upload */}
        <div className="rounded-lg border border-[#e4ded6] bg-white p-5">
          <h3 className="text-sm font-medium text-[#2f2a24]">{t("addImages")}</h3>
          <p className="mt-1 text-xs text-[#7a7167]">{t("addImagesHelp")}</p>
          <div className="mt-3">
            <ImageUpload images={images} onChange={setImages} maxImages={4} />
          </div>
        </div>

        {/* Share */}
        <ShareButton runId={runId} />

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
        {/* Full before/after comparison table — only show if changes exist */}
        {result.change_log.length > 0 ? (
        <section className="rounded-lg border border-[#e4ded6] bg-white p-5">
          <h2 className="text-base font-semibold text-[#2f2a24]">{t("substitutions")}</h2>

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
              original: `${original.cook_time_minutes} 分钟`,
              forked: `${forked.cook_time_minutes} 分钟`,
              changed: original.cook_time_minutes !== forked.cook_time_minutes,
              reason: findReason("cook_time_minutes"),
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

          {/* Change reasons — deduplicate by reason */}
          {result.change_log.length > 0 ? (
            <div className="mt-4 space-y-2 border-t border-[#f0ebe4] pt-3">
              {[...new Set(result.change_log.map(c => c.reason))].map((reason, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <span className="mt-0.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[#2f6b45]" />
                  <span className="text-[#5a5249]">{reason}</span>
                </div>
              ))}
            </div>
          ) : null}
        </section>
        ) : null}

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

        {/* Shopping list */}
        <ShoppingList forkedMeals={forked.meals} />

        <OriginalPostCard pack={result.original_meal_pack} />

        <FinalReviewCard review={result.final_review} />
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

function NeedsInputView({ runId, unresolved }: { runId: string; unresolved: any }) {
  const t = useTranslations("Run");
  const router = useRouter();
  const [resolving, setResolving] = useState(false);
  const [picks, setPicks] = useState<Record<string, string>>({});

  const items: Array<{ type: string; message: string; affected_items: string[]; suggested_action?: string }> =
    unresolved?.unresolved_payload?.items || [];

  function handleResolve() {
    setResolving(true);
    resolveRun(runId, picks).then((updated) => {
      if (updated.status === "succeeded" || updated.status === "needs_input") {
        router.refresh();
      }
    }).catch(() => setResolving(false));
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-lg border border-[#f0d060] bg-[#fffdf0] p-5">
        <AlertTriangle size={18} className="mt-0.5 shrink-0 text-[#b8860b]" />
        <div>
          <h2 className="font-semibold text-[#2f2a24]">{t("needsInputTitle")}</h2>
          <p className="mt-1 text-sm text-[#625b52]">{t("needsInputDescription")}</p>
        </div>
      </div>

      {items.map((item, i) => (
        <div key={i} className="rounded-lg border border-[#e4ded6] bg-white p-4">
          <p className="text-sm font-medium text-[#2f2a24]">{item.message}</p>
          {item.suggested_action && (
            <p className="mt-1 text-xs text-[#7a7167]">{item.suggested_action}</p>
          )}
          <div className="mt-3">
            <label className="text-xs text-[#625b52]">{t("chooseSubstitute")}</label>
            <input
              value={picks[i] || ""}
              onChange={(e) => setPicks({ ...picks, [i]: e.target.value })}
              className="input mt-1"
              placeholder={t("substitutePlaceholder")}
            />
          </div>
        </div>
      ))}

      <Button onClick={handleResolve} disabled={resolving} className="w-full">
        {resolving ? <Loader2 size={16} className="animate-spin" /> : null}
        <span className="ml-2">{t("continueFork")}</span>
      </Button>
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
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t("fieldCookTime")}>
                  <input value={`${firstMeal.cook_time_minutes} min`} readOnly className="input bg-[#fafafa]" />
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
        {result.change_log.length > 0 && (
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
            rows.push({ label: t("fieldCookTime"), original: `${original.cook_time_minutes} 分钟`, forked: `${forked.cook_time_minutes} 分钟`, changed: original.cook_time_minutes !== forked.cook_time_minutes });
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
              {[...new Set(result.change_log.map(c => c.reason))].map((reason, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <span className="mt-0.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[#2f6b45]" />
                  <span className="text-[#5a5249]">{reason}</span>
                </div>
              ))}
            </div>
          ) : null}
        </section>
        )}

        <OriginalPostCard pack={result.original_meal_pack} />

        <FinalReviewCard review={result.final_review} />
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

// Time-based step estimation (typical durations in seconds)
const STEP_TIMES = [
  { node: "load_input", labelKey: "stepLoading", end: 0.5 },
  { node: "user_agent", labelKey: "stepAnalyzing", end: 2 },
  { node: "reviewer_agents", labelKey: "stepChecking", end: 3.5 },
  { node: "adapter_agent", labelKey: "stepAdapting", end: 7 },
  { node: "cooking_steps", labelKey: "stepCooking", end: 9 },
  { node: "final_validation", labelKey: "stepValidating", end: 9.5 },
];

function ForkProgress({ run }: { run: { status: string; trace?: { steps: { node: string; status: string }[] } | null } }) {
  const t = useTranslations("Run");
  const [elapsed, setElapsed] = useState(0);
  const completedNodes = new Set((run.trace?.steps || []).filter(s => s.status === "success").map(s => s.node));
  const hasTrace = (run.trace?.steps || []).length > 0;

  useEffect(() => {
    if (run.status !== "running" && run.status !== "queued") return;
    const start = Date.now();
    const iv = setInterval(() => setElapsed((Date.now() - start) / 1000), 200);
    return () => clearInterval(iv);
  }, [run.status]);

  // Find rightmost completed step — mark all before it as done too (parallel steps)
  let lastDoneIdx = -1;
  for (let i = STEP_TIMES.length - 1; i >= 0; i--) {
    if (completedNodes.has(STEP_TIMES[i].node)) { lastDoneIdx = i; break; }
  }
  const currentIdx = hasTrace
    ? (lastDoneIdx + 1 < STEP_TIMES.length ? lastDoneIdx + 1 : -1)
    : STEP_TIMES.findIndex(s => elapsed < s.end);

  return (
    <div className="rounded-lg border border-[#e4ded6] bg-white p-5">
      <h2 className="mb-4 font-semibold text-[#2f2a24]">{t("forkInProgress")}</h2>
      <div className="space-y-3">
        {STEP_TIMES.map((step, i) => {
          const done = i <= lastDoneIdx;
          const active = i === currentIdx;
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

function ShareButton({ runId }: { runId: string }) {
  const t = useTranslations("Run");
  const [copied, setCopied] = useState(false);

  function handleShare() {
    const url = `${window.location.origin}/en/runs/${runId}`;
    if (navigator.share) {
      navigator.share({ title: "ForkFit Fork", url }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#e4ded6] bg-white px-4 py-3 text-sm font-medium text-[#625b52] hover:bg-[#faf8f5] transition-colors"
    >
      {copied ? <CheckCircle2 size={14} className="text-[#2f6b45]" /> : <Share2 size={14} />}
      {copied ? t("linkCopied") : t("shareFork")}
    </button>
  );
}

function ShoppingList({ forkedMeals }: { forkedMeals: { name: string; ingredients: string[] }[] }) {
  const t = useTranslations("Run");

  // Merge and deduplicate ingredients from all meals
  const ingredientMap = new Map<string, string[]>();
  for (const meal of forkedMeals) {
    for (const ing of meal.ingredients) {
      const key = ing.toLowerCase().trim();
      if (!ingredientMap.has(key)) {
        ingredientMap.set(key, []);
      }
      ingredientMap.get(key)!.push(meal.name);
    }
  }

  if (ingredientMap.size === 0) return null;

  return (
    <div className="rounded-lg border border-[#e4ded6] bg-white p-5">
      <h3 className="text-sm font-medium text-[#2f2a24]">{t("shoppingList")}</h3>
      <p className="mt-1 text-xs text-[#7a7167]">{t("shoppingListHelp")}</p>
      <ul className="mt-3 space-y-1.5">
        {[...ingredientMap.entries()].map(([ing, meals]) => (
          <li key={ing} className="flex items-center gap-2 text-sm text-[#625b52]">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#2f6b45]" />
            <span className="font-medium">{ing}</span>
            {meals.length > 1 && (
              <span className="text-xs text-[#9f9890]">({meals.length}×)</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

const REVIEW_STYLE: Record<string, { color: string; bg: string; icon: typeof CheckCircle2 }> = {
  pass:  { color: "text-[#2f6b45]", bg: "bg-[#f0faf3]", icon: CheckCircle2 },
  warn:  { color: "text-[#b8860b]", bg: "bg-[#fffdf0]", icon: AlertTriangle },
  block: { color: "text-[#7f3525]", bg: "bg-[#fff8f5]", icon: XCircle },
};

function FinalReviewCard({ review }: { review: { agent: string; status: string; findings: { type: string; severity: string; message: string; suggested_action?: string }[] } }) {
  const t = useTranslations("Run");
  const style = REVIEW_STYLE[review.status] || REVIEW_STYLE.pass;
  const Icon = style.icon;
  const statusLabel = t(`status${review.status.charAt(0).toUpperCase() + review.status.slice(1)}` as any, { defaultValue: review.status });

  return (
    <section className="rounded-lg border border-[#e4ded6] bg-white p-5">
      <h2 className="text-sm font-medium text-[#6f6a61]">{t("finalReview")}</h2>
      <div className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${style.bg} ${style.color}`}>
        <Icon size={12} />
        {statusLabel}
      </div>
      {review.findings.length > 0 && (
        <div className="mt-3 space-y-2">
          {review.findings.map((f, i) => (
            <div key={i} className="flex items-start gap-2 text-xs">
              <span className={`mt-0.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${f.severity === "high" ? "bg-[#7f3525]" : f.severity === "medium" ? "bg-[#b8860b]" : "bg-[#9f9890]"}`} />
              <span className="text-[#5a5249]">{f.message}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function OriginalPostCard({ pack }: { pack: { id: string; title: string; theme: string; meals: { name: string; ingredients: string[] }[] } }) {
  const t = useTranslations("Run");
  const firstMeal = pack.meals[0];

  return (
    <section className="rounded-lg border border-[#e4ded6] bg-white p-5">
      <h2 className="text-sm font-medium text-[#6f6a61]">{t("originalPost")}</h2>
      <p className="mt-2 text-sm font-semibold text-[#2f2a24]">{pack.title}</p>
      {pack.theme && <p className="mt-0.5 text-xs text-[#9f9890]">{pack.theme}</p>}
      {firstMeal && (
        <p className="mt-2 text-xs text-[#7a7167]">
          🥘 {firstMeal.name} · {firstMeal.ingredients.slice(0, 3).join("、")}{firstMeal.ingredients.length > 3 ? "…" : ""}
        </p>
      )}
      <p className="mt-1 text-xs text-[#9f9890]">{t("originalPostHint")}</p>
      <Link
        href={`/packs/${pack.id}`}
        target="_blank"
        className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-[#d8d0c6] bg-white px-3 py-1.5 text-xs font-medium text-[#625b52] hover:bg-[#faf8f5]"
      >
        <ExternalLink size={12} />
        {t("viewOriginal")}
      </Link>
    </section>
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
