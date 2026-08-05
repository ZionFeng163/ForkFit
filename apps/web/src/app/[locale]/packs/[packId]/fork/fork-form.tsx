"use client";

import { useEffect, useState } from "react";
import {
  ArrowLeft, Check, CheckCircle2,
  Loader2, Sparkles, X,
} from "lucide-react";

import { RemoteImage } from "@/components/remote-image";
import { ImageUpload } from "@/components/image-upload";
import { Link, useRouter } from "@/i18n/routing";
import {
  createRun, getRun, getPost, publishRun, saveRun, extractMyPreferences,
} from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import type { RecipePost, RunResultPayload } from "@/types/forkfit";

export function ForkContent({ post }: { post: RecipePost }) {
  const router = useRouter();
  const firstMeal = post.recipe;

  // Run state
  const [runId, setRunId] = useState<string | null>(null);
  const [runStatus, setRunStatus] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<RunResultPayload | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const isRunning = runStatus === "queued" || runStatus === "running";

  // User input
  const [requirement, setRequirement] = useState("");
  const [extracting, setExtracting] = useState(false);

  // Editable result fields
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editIngredients, setEditIngredients] = useState("");
  const [editEquipment, setEditEquipment] = useState("");
  const [editCookTime, setEditCookTime] = useState("");
  const [editTags, setEditTags] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editSteps, setEditSteps] = useState<string[]>([]);
  const [editImages, setEditImages] = useState<string[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Poll for run status
  useEffect(() => {
    if (!runId || runStatus === "succeeded" || runStatus === "failed" || runStatus === "needs_input") return;
    let pollCount = 0;
    const MAX_POLLS = 120;
    const interval = setInterval(async () => {
      pollCount++;
      if (pollCount > MAX_POLLS) {
        clearInterval(interval);
        setRunError("定制超时，请刷新页面重试");
        return;
      }
      try {
        const run = await getRun(runId);
        setRunStatus(run.status);
        if (run.status === "succeeded" && run.result) {
          setRunResult(run.result);
          const meal = run.result.forked_meal_pack?.meals?.[0];
          if (meal) {
            setEditTitle(run.result.forked_meal_pack.title || meal.name || "");
            setEditDesc(run.result.description || run.result.summary || "");
            setEditIngredients(meal.ingredients.join(", "));
            setEditEquipment(meal.equipment.join(", "));
            setEditCookTime(String(meal.cook_time_minutes || 30));
            setEditTags(meal.tags.join(", "));
            setEditNotes(meal.notes || "");
            setEditSteps(meal.steps?.length ? [...meal.steps] : []);
            // Load original post images as default
            getPost(post.id).then((p) => {
              if (p.image_urls.length > 0) setEditImages(p.image_urls);
            }).catch(() => {});
          }
        } else if (run.status === "failed") {
          setRunError(run.error?.message || "定制失败");
        } else if (run.status === "needs_input") {
          setRunError(run.unresolved_payload?.message || "这个要求还需要你确认一下，再继续定制。");
        }
      } catch {}
    }, 1000);
    return () => clearInterval(interval);
  }, [runId, runStatus, post.id]);

  // Start customization
  async function handleStart() {
    setCreating(true);
    setRunResult(null);
    setRunError(null);
    setActionError(null);
    try {
      const profileHelpers = await import("@/lib/user-profile");
      const profile = profileHelpers.loadUserProfileForm();
      const profileData = profileHelpers.applyRequirementToUserProfile(
        profileHelpers.profileFormToUserProfile(profile),
        requirement,
      );
      const resp = await createRun({
        user_profile: profileData,
        meal_pack: { id: post.id, title: post.title, theme: post.theme, meals: [firstMeal] },
        locale: "zh",
        request_text: requirement.trim(),
      });
      setRunId(resp.run_id);
      setRunStatus(resp.status);
    } catch (error: unknown) {
      setActionError(errorMessage(error, "定制失败"));
    }
    setCreating(false);
  }

  // Extract preferences into requirement box
  async function handleExtract() {
    setExtracting(true);
    try {
      const result = await extractMyPreferences("zh");
      const prefs = result.preferences;
      const parts: string[] = [];
      const fmt = (v: unknown) => Array.isArray(v) ? v.filter(Boolean).join("、") : (v || "");
      const likes = fmt(prefs.likes);
      const dislikes = fmt(prefs.dislikes);
      const allergies = fmt(prefs.allergies);
      const dietRules = fmt(prefs.diet_rules);
      if (likes) parts.push(`喜欢：${likes}`);
      if (dislikes) parts.push(`不喜欢：${dislikes}`);
      if (allergies) parts.push(`过敏：${allergies}`);
      if (dietRules) parts.push(`饮食限制：${dietRules}`);
      if (parts.length > 0) {
        setRequirement((prev) => prev ? prev + "\n" + parts.join("\n") : parts.join("\n"));
      }
    } catch (error: unknown) {
      setActionError(errorMessage(error, "提取偏好失败"));
    }
    setExtracting(false);
  }

  // Publish
  async function handlePublish() {
    if (!runId) return;
    setPublishing(true);
    setActionError(null);
    try {
      const splitList = (s: string) => s.split(/[,，]/).map((x) => x.trim()).filter(Boolean);
      const published = await publishRun(runId, {
        title: editTitle,
        description: editDesc,
        image_urls: editImages.length > 0 ? editImages : post.image_urls,
        recipe_name: editTitle,
        ingredients: splitList(editIngredients),
        equipment: splitList(editEquipment),
        cook_time_minutes: Number(editCookTime) || 30,
        tags: splitList(editTags),
        notes: editNotes,
        steps: editSteps,
      });
      setPublished(true);
      setTimeout(() => router.push(`/packs/${published.id}`), 1500);
    } catch (error: unknown) {
      setActionError(errorMessage(error, "发布失败"));
    }
    setPublishing(false);
  }

  // Save
  const [saveSuccess, setSaveSuccess] = useState(false);

  async function handleSave() {
    if (!runId) return;
    setSaving(true);
    setActionError(null);
    try {
      await saveRun(runId);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (error: unknown) {
      setActionError(errorMessage(error, "保存失败"));
    }
    setSaving(false);
  }

  return (
    <div className="site-container max-w-[920px] pb-20">
      {/* Back */}
      <div className="pt-6 pb-4">
        <Link href={`/packs/${post.id}`} className="inline-flex items-center gap-1.5 text-sm font-medium transition-colors" style={{ color: "var(--muted)" }}>
          <ArrowLeft size={18} /> 返回详情
        </Link>
      </div>

      {/* Recipe Hero */}
      <div className="mb-6 grid overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--surface)] md:grid-cols-[240px_1fr]">
        <div className="relative min-h-[180px] w-full bg-[var(--surface-container-high)]">
          {post.image_urls.length > 0 ? (
            <RemoteImage src={post.image_urls[0]} alt={post.title} className="w-full h-full object-cover" />
          ) : <RemoteImage src="" alt={post.title} className="h-full w-full" />}
        </div>
        <div className="p-5 md:p-6">
          <p className="mb-3 text-sm font-semibold text-[var(--brand-hover)]">
            {runResult ? "原版菜谱" : isRunning ? "正在定制" : runStatus === "needs_input" ? "需要你确认" : "准备定制"}
          </p>
          <h1 className="text-2xl font-bold tracking-[-0.03em] mb-2" style={{ color: "var(--text)" }}>{post.title}</h1>
          <p className="line-clamp-2 max-w-[560px] text-[15px] leading-[1.6]" style={{ color: "var(--muted)" }}>{post.description}</p>
          <div className="mt-4 flex gap-4 border-t border-[var(--line)] pt-3 text-sm text-[var(--muted-text)]"><span>{firstMeal.cook_time_minutes} 分钟</span><span>{firstMeal.ingredients.length} 种食材</span></div>
        </div>
      </div>

      {/* Requirement input */}
      {!runResult && (
        <div className="mb-6 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-6">
          <h2 className="section-heading">你的定制需求</h2>
          <p className="mb-4 mt-2 text-[13px] text-[var(--muted-text)]">写下时间、人数、忌口或口味要求。</p>
          <textarea
            value={requirement}
            onChange={(e) => setRequirement(e.target.value)}
            placeholder="例如：少盐、30 分钟内、多加蔬菜"
            rows={4}
            className="mb-3 min-h-[120px] w-full resize-y rounded-lg border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm leading-[1.65] outline-none focus:border-[var(--focus)]"
          />
          {/* Quick presets */}
          <div className="flex flex-wrap gap-2 mb-4">
            {["少放盐", "更辣一点", "减少食材", "素食版本", "缩短时间", "多加蔬菜", "换成鸡胸肉", "去掉花生"].map((preset) => (
              <button key={preset} type="button"
                onClick={() => setRequirement((prev) => prev ? prev + "、" + preset : preset)}
                className="rounded-md border border-[var(--line)] bg-transparent px-3 py-1.5 text-[12px] font-medium text-[var(--muted-text)] hover:border-[var(--brand)] hover:text-[var(--brand-hover)]">
                + {preset}
              </button>
            ))}
          </div>
          <div className="flex gap-3 flex-wrap">
            <button onClick={handleStart} disabled={creating || isRunning}
              className="button-primary disabled:opacity-50">
              {creating || isRunning ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
              开始定制
            </button>
            <button onClick={handleExtract} disabled={extracting}
              className="button-secondary disabled:opacity-50">
              {extracting ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              沿用我的口味
            </button>
          </div>
        </div>
      )}

      {(actionError || runError) && (
        <div
          className="mb-4 whitespace-pre-line rounded-lg px-4 py-3 text-[13px] leading-6"
          style={{
            background: runStatus === "needs_input" ? "var(--warning-soft)" : "var(--danger-soft)",
            color: runStatus === "needs_input" ? "var(--warning)" : "var(--danger)",
          }}
        >
          {actionError || runError}
          <button
            onClick={() => {
              setActionError(null);
              setRunError(null);
            }}
            className="ml-3 opacity-70 hover:opacity-100"
          >
            ×
          </button>
        </div>
      )}

      {/* Result */}
      {runResult && (
        <div className="mb-6 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-6">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-base font-bold" style={{ color: "var(--text)" }}>
              <CheckCircle2 size={20} style={{ color: "var(--success)" }} /> 定制完成
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setRunResult(null); setRunId(null); setRunStatus(null); }}
                className="px-4 py-2 rounded-lg text-[13px] font-semibold transition-all duration-150"
                style={{ border: "1.5px solid var(--separator)", background: "var(--surface)", color: "var(--muted, var(--muted))" }}>
                重新定制
              </button>
              <button onClick={() => setShowEditor((value) => !value)}
                className="px-4 py-2 rounded-lg text-[13px] font-semibold text-white transition-all duration-150 disabled:opacity-50"
                style={{ background: "var(--brand)" }}>
                {showEditor ? "收起编辑" : "编辑后发布"}
              </button>
            </div>
          </div>

          <div className="mb-6 border-y border-[var(--line)] py-5">
            <h2 className="mb-2 text-xl font-bold tracking-[-0.02em] text-[var(--text)]">{editTitle}</h2>
            <p className="max-w-[720px] text-[15px] leading-7 text-[var(--muted)]">
              {runResult.summary || editDesc}
            </p>
            {runResult.change_log.length > 0 && (
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {runResult.change_log.slice(0, 4).map((change, index) => (
                  <div key={`${change.affected_item}-${index}`} className="border-l-2 border-[var(--brand)] pl-3 text-sm leading-6">
                    <div className="font-medium text-[var(--text)]">{change.reason}</div>
                    <div className="text-[var(--muted-text)]">{change.from_value} → {change.to_value || "移除"}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mb-7 grid gap-8 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <section>
              <h3 className="mb-3 text-sm font-bold text-[var(--text)]">准备这些</h3>
              <ul className="space-y-2 text-sm leading-6 text-[var(--muted)]">
                {runResult.forked_meal_pack.meals[0]?.ingredients.map((ingredient) => <li key={ingredient}>{ingredient}</li>)}
              </ul>
            </section>
            <section>
              <h3 className="mb-3 text-sm font-bold text-[var(--text)]">照着做</h3>
              <ol className="space-y-4">
                {runResult.forked_meal_pack.meals[0]?.steps.map((step, index) => (
                  <li key={`${index}-${step}`} className="grid grid-cols-[24px_1fr] gap-3 text-sm leading-6 text-[var(--muted)]">
                    <span className="font-semibold text-[var(--brand-hover)]">{index + 1}</span><span>{step}</span>
                  </li>
                ))}
              </ol>
            </section>
          </div>

          {actionError && (
            <div className="mb-4 px-4 py-3 rounded-lg text-[13px]" style={{ background: "var(--danger-soft)", color: "var(--danger)" }}>
              {actionError}
              <button onClick={() => setActionError(null)} className="ml-3 opacity-70 hover:opacity-100">×</button>
            </div>
          )}

          {showEditor && <>
          <div className="mb-4 border-t border-[var(--line)] pt-5">
            <h3 className="text-base font-bold text-[var(--text)]">发布前再检查一遍</h3>
            <p className="mt-1 text-sm text-[var(--muted-text)]">只在需要时修改，确认后再发布到社区。</p>
          </div>
          {/* Editable fields */}
          <div className="space-y-4 mb-6">
            <EditField label="标题">
              <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="w-full px-3.5 py-2.5 text-sm rounded-lg outline-none" style={{ border: "1.5px solid var(--separator)", background: "var(--surface)", color: "var(--text)" }} />
            </EditField>
            <EditField label="描述">
              <textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} rows={3} className="w-full px-3.5 py-2.5 text-sm rounded-lg outline-none resize-y min-h-[80px] leading-[1.65]" style={{ border: "1.5px solid var(--separator)", background: "var(--surface)", color: "var(--text)" }} />
            </EditField>
            <EditField label="食材" hint="用逗号分隔">
              <textarea value={editIngredients} onChange={(e) => setEditIngredients(e.target.value)} rows={3} className="w-full px-3.5 py-2.5 text-sm rounded-lg outline-none resize-y min-h-[80px] leading-[1.65]" style={{ border: "1.5px solid var(--separator)", background: "var(--surface)", color: "var(--text)" }} />
            </EditField>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <EditField label="厨具">
                <input value={editEquipment} onChange={(e) => setEditEquipment(e.target.value)} className="w-full px-3.5 py-2.5 text-sm rounded-lg outline-none" style={{ border: "1.5px solid var(--separator)", background: "var(--surface)", color: "var(--text)" }} />
              </EditField>
              <EditField label="烹饪时间（分钟）">
                <input type="number" min="1" value={editCookTime} onChange={(e) => setEditCookTime(e.target.value)} className="w-full px-3.5 py-2.5 text-sm rounded-lg outline-none" style={{ border: "1.5px solid var(--separator)", background: "var(--surface)", color: "var(--text)" }} />
              </EditField>
              <EditField label="标签">
                <input value={editTags} onChange={(e) => setEditTags(e.target.value)} className="w-full px-3.5 py-2.5 text-sm rounded-lg outline-none" style={{ border: "1.5px solid var(--separator)", background: "var(--surface)", color: "var(--text)" }} />
              </EditField>
            </div>
            <EditField label="备注">
              <textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} rows={3} className="w-full px-3.5 py-2.5 text-sm rounded-lg outline-none resize-y min-h-[80px] leading-[1.65]" style={{ border: "1.5px solid var(--separator)", background: "var(--surface)", color: "var(--text)" }} />
            </EditField>
          </div>

          {/* Steps */}
          <div className="mb-6">
            <h3 className="text-sm font-bold mb-3 flex items-center gap-1.5" style={{ color: "var(--text)" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>
              烹饪步骤
            </h3>
            <div className="flex flex-col gap-2">
              {editSteps.map((step, i) => (
                <div key={i} className="flex gap-3 items-start">
                  <div className="w-7 h-7 min-w-7 rounded-full grid place-items-center text-[13px] font-bold text-white mt-2" style={{ background: "var(--brand)" }}>{i + 1}</div>
                  <input value={step} onChange={(e) => { const s = [...editSteps]; s[i] = e.target.value; setEditSteps(s); }}
                    className="flex-1 px-3.5 py-2.5 text-sm rounded-lg outline-none" style={{ border: "1.5px solid var(--separator)", background: "var(--surface)", color: "var(--text)" }} />
                  <button onClick={() => setEditSteps(editSteps.filter((_, j) => j !== i))} className="mt-2 p-1" style={{ color: "var(--muted)" }}>
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>
            <button onClick={() => setEditSteps([...editSteps, ""])}
              className="mt-3 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[13px] font-medium transition-all duration-150"
              style={{ border: "1.5px dashed var(--separator)", color: "var(--muted)", background: "transparent" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              添加步骤
            </button>
          </div>

          {/* Image upload */}
          <div className="mb-6">
            <h3 className="text-sm font-bold mb-3" style={{ color: "var(--text)" }}>菜谱图片</h3>
            <ImageUpload images={editImages} onChange={setEditImages} maxImages={4} />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-5" style={{ borderTop: "1px solid var(--separator)" }}>
            <button onClick={handlePublish} disabled={publishing || published} className="button-primary disabled:opacity-50">
              {publishing ? <Loader2 size={14} className="animate-spin" /> : null}
              {published ? "已发布" : "确认发布"}
            </button>
            <button onClick={handleSave} disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-[13px] font-semibold transition-all duration-150 disabled:opacity-50"
              style={{
                border: `1.5px solid ${saveSuccess ? "var(--success)" : "var(--separator)"}`,
                background: saveSuccess ? "var(--success-soft)" : "var(--surface)",
                color: saveSuccess ? "var(--success)" : "var(--muted, var(--muted))",
              }}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : saveSuccess ? <Check size={14} /> : null}
              {saveSuccess ? "已保存 ✓" : "保存到我的菜谱"}
            </button>
            <Link href={`/packs/${post.id}`} target="_blank"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-[13px] font-semibold transition-all duration-150"
              style={{ border: "1.5px solid var(--separator)", background: "var(--surface)", color: "var(--muted, var(--muted))" }}>
              查看原版菜谱
            </Link>
          </div>
          </>}
        </div>
      )}
    </div>
  );
}

function EditField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[13px] font-semibold mb-1.5" style={{ color: "var(--text)" }}>{label}</label>
      {children}
      {hint && <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>{hint}</div>}
    </div>
  );
}
