"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  ArrowLeft, Check, CheckCircle2, ChevronDown,
  Loader2, Send, Sparkles, X,
} from "lucide-react";

import { RemoteImage } from "@/components/remote-image";
import { ImageUpload } from "@/components/image-upload";
import { useAuth } from "@/components/auth-provider";
import { Link, useRouter } from "@/i18n/routing";
import {
  createRun, getRun, getPost, publishRun, saveRun, extractMyPreferences,
} from "@/lib/api";
import type { RecipePost, RunResultPayload } from "@/types/forkfit";

const GRADIENTS = [
  "linear-gradient(135deg, #f9ddd4, #fde2d3, #fef0ec)",
  "linear-gradient(135deg, #e8f5ee, #c8e6d5)",
  "linear-gradient(135deg, #eef4fd, #d4e4f9)",
];

function getGradient(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  const idx = Math.abs(hash) % GRADIENTS.length;
  const strokes = ["#e85d3a", "#2d8a56", "#4a8ac9"];
  return { gradient: GRADIENTS[idx], stroke: strokes[idx] };
}

export function ForkContent({ post }: { post: RecipePost }) {
  const t = useTranslations("Fork");
  const router = useRouter();
  const { user } = useAuth();
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
      const profile = await import("@/lib/user-profile").then((m) => m.loadUserProfileForm());
      const profileData = await import("@/lib/user-profile").then((m) => m.profileFormToUserProfile(profile));
      const resp = await createRun({
        user_profile: profileData,
        meal_pack: { id: post.id, title: post.title, theme: post.theme, meals: [firstMeal] },
        locale: "zh",
      });
      setRunId(resp.run_id);
      setRunStatus(resp.status);
    } catch (e: any) {
      setActionError(e.message || "定制失败");
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
    } catch (e: any) {
      setActionError(e.message || "提取偏好失败");
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
    } catch (e: any) {
      setActionError(e.message || "发布失败");
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
    } catch (e: any) {
      setActionError(e.message || "保存失败");
    }
    setSaving(false);
  }

  function toggleIngredientCheck(idx: number) {
    // Visual only for now
  }

  return (
    <div className="mx-auto max-w-[860px] px-7 pb-20">
      {/* Back */}
      <div className="pt-6 pb-4">
        <Link href={`/packs/${post.id}`} className="inline-flex items-center gap-1.5 text-sm font-medium transition-colors" style={{ color: "var(--lp-muted)" }}>
          <ArrowLeft size={18} /> 返回详情
        </Link>
      </div>

      {/* Recipe Hero */}
      <div className="rounded-2xl overflow-hidden mb-6" style={{ background: "var(--lp-surface)", border: "1px solid var(--lp-border)" }}>
        <div className="relative w-full" style={{ height: "280px", background: GRADIENTS[0] }}>
          {post.image_urls.length > 0 ? (
            <RemoteImage src={post.image_urls[0]} alt={post.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full grid place-items-center">
              <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="var(--lp-accent)" strokeWidth="1.2" opacity="0.35">
                <path d="M12 2C6.48 2 2 6 2 10c0 2.5 1.5 5 4 6.5V22l4-2.5c.6.2 1.3.5 2 .5 5.52 0 10-4 10-8s-4.48-8-10-8z" />
              </svg>
            </div>
          )}
          <div className="absolute top-4 left-4 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold"
            style={{ background: "rgba(255,255,255,0.92)", backdropFilter: "blur(8px)", color: "var(--lp-accent)", boxShadow: "var(--lp-shadow-sm)" }}>
            <Sparkles size={14} /> AI 推荐菜谱
          </div>
        </div>
        <div className="p-7">
          <div className="flex gap-2 flex-wrap mb-4">
            {firstMeal.cook_time_minutes > 0 && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium" style={{ background: "var(--lp-green-light)", color: "var(--lp-green)" }}>
                {firstMeal.cook_time_minutes} 分钟
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium" style={{ background: "var(--lp-warm-100)", color: "var(--lp-fg-secondary, var(--lp-muted))" }}>
              中等难度
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-[-0.02em] mb-2" style={{ color: "var(--lp-fg)" }}>{post.title}</h1>
          <p className="text-[15px] leading-[1.6] max-w-[560px]" style={{ color: "var(--lp-muted)" }}>{post.description}</p>
          {firstMeal.ingredients.length > 0 && (
            <div className="mt-5 pt-5" style={{ borderTop: "1px solid var(--lp-border)" }}>
              <div className="text-xs font-semibold uppercase tracking-[0.08em] mb-2.5" style={{ color: "var(--lp-muted)" }}>主要食材</div>
              <div className="flex flex-wrap gap-2">
                {firstMeal.ingredients.slice(0, 8).map((ing: string, i: number) => (
                  <span key={i} className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[13px] font-medium" style={{ background: "var(--lp-warm-100)", color: "var(--lp-fg-secondary, var(--lp-muted))" }}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--lp-accent)", opacity: 0.6 }} />{ing}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Requirement input */}
      {!runResult && (
        <div className="rounded-2xl p-6 mb-6" style={{ background: "var(--lp-surface)", border: "1px solid var(--lp-border)" }}>
          <h2 className="text-base font-bold mb-3" style={{ color: "var(--lp-fg)" }}>你的定制需求</h2>
          <p className="text-[13px] mb-4" style={{ color: "var(--lp-muted)" }}>告诉 AI 你想怎么调整这道菜</p>
          <textarea
            value={requirement}
            onChange={(e) => setRequirement(e.target.value)}
            placeholder="例如：少放盐、换成鸡胸肉、多加蔬菜、做成素食版本…"
            rows={4}
            className="w-full px-4 py-3 rounded-xl text-sm outline-none resize-y min-h-[100px] leading-[1.65] mb-3"
            style={{ border: "1.5px solid var(--lp-border)", background: "var(--lp-surface)", color: "var(--lp-fg)" }}
          />
          {/* Quick presets */}
          <div className="flex flex-wrap gap-2 mb-4">
            {["少放盐", "更辣一点", "减少食材", "素食版本", "缩短时间", "多加蔬菜", "换成鸡胸肉", "去掉花生"].map((preset) => (
              <button key={preset} type="button"
                onClick={() => setRequirement((prev) => prev ? prev + "、" + preset : preset)}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[12px] font-medium transition-all duration-150"
                style={{ border: "1px solid var(--lp-border)", background: "var(--lp-surface)", color: "var(--lp-fg-secondary, var(--lp-muted))" }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--lp-accent)"; e.currentTarget.style.color = "var(--lp-accent)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--lp-border)"; e.currentTarget.style.color = "var(--lp-fg-secondary, var(--lp-muted))"; }}>
                + {preset}
              </button>
            ))}
          </div>
          <div className="flex gap-3 flex-wrap">
            <button onClick={handleStart} disabled={creating || isRunning}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white transition-all duration-200 disabled:opacity-50"
              style={{ background: "var(--lp-accent)", boxShadow: "0 2px 8px rgba(232,93,58,0.25)" }}>
              {creating || isRunning ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
              开始定制
            </button>
            <button onClick={handleExtract} disabled={extracting}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold transition-all duration-200 disabled:opacity-50"
              style={{ border: "1.5px solid var(--lp-border)", background: "var(--lp-surface)", color: "var(--lp-fg-secondary, var(--lp-muted))" }}>
              {extracting ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              从我的帖子提取口味
            </button>
          </div>
        </div>
      )}

      {actionError && (
        <div className="mb-4 px-4 py-3 rounded-xl text-[13px]" style={{ background: "#fef0ef", color: "#7f3525" }}>
          {actionError}
          <button onClick={() => setActionError(null)} className="ml-3 opacity-70 hover:opacity-100">×</button>
        </div>
      )}

      {/* Result */}
      {runResult && (
        <div className="rounded-2xl p-6 mb-6" style={{ background: "var(--lp-surface)", border: "1px solid var(--lp-border)" }}>
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2 text-base font-bold" style={{ color: "var(--lp-fg)" }}>
              <CheckCircle2 size={20} style={{ color: "var(--lp-green)" }} /> 定制完成
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setRunResult(null); setRunId(null); setRunStatus(null); }}
                className="px-4 py-2 rounded-lg text-[13px] font-semibold transition-all duration-150"
                style={{ border: "1.5px solid var(--lp-border)", background: "var(--lp-surface)", color: "var(--lp-fg-secondary, var(--lp-muted))" }}>
                重新定制
              </button>
              <button onClick={handlePublish} disabled={publishing || published}
                className="px-4 py-2 rounded-lg text-[13px] font-semibold text-white transition-all duration-150 disabled:opacity-50"
                style={{ background: published ? "var(--lp-green)" : "var(--lp-accent)" }}>
                {publishing ? <Loader2 size={14} className="animate-spin inline" /> : null}
                {published ? "已发布 ✓" : "发布菜谱"}
              </button>
            </div>
          </div>

          {actionError && (
            <div className="mb-4 px-4 py-3 rounded-xl text-[13px]" style={{ background: "#fef0ef", color: "#7f3525" }}>
              {actionError}
              <button onClick={() => setActionError(null)} className="ml-3 opacity-70 hover:opacity-100">×</button>
            </div>
          )}

          {/* Editable fields */}
          <div className="space-y-4 mb-6">
            <EditField label="标题">
              <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="w-full px-3.5 py-2.5 text-sm rounded-lg outline-none" style={{ border: "1.5px solid var(--lp-border)", background: "var(--lp-surface)", color: "var(--lp-fg)" }} />
            </EditField>
            <EditField label="描述">
              <textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} rows={3} className="w-full px-3.5 py-2.5 text-sm rounded-lg outline-none resize-y min-h-[80px] leading-[1.65]" style={{ border: "1.5px solid var(--lp-border)", background: "var(--lp-surface)", color: "var(--lp-fg)" }} />
            </EditField>
            <EditField label="食材" hint="用逗号分隔">
              <textarea value={editIngredients} onChange={(e) => setEditIngredients(e.target.value)} rows={3} className="w-full px-3.5 py-2.5 text-sm rounded-lg outline-none resize-y min-h-[80px] leading-[1.65]" style={{ border: "1.5px solid var(--lp-border)", background: "var(--lp-surface)", color: "var(--lp-fg)" }} />
            </EditField>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <EditField label="厨具">
                <input value={editEquipment} onChange={(e) => setEditEquipment(e.target.value)} className="w-full px-3.5 py-2.5 text-sm rounded-lg outline-none" style={{ border: "1.5px solid var(--lp-border)", background: "var(--lp-surface)", color: "var(--lp-fg)" }} />
              </EditField>
              <EditField label="烹饪时间（分钟）">
                <input type="number" min="1" value={editCookTime} onChange={(e) => setEditCookTime(e.target.value)} className="w-full px-3.5 py-2.5 text-sm rounded-lg outline-none" style={{ border: "1.5px solid var(--lp-border)", background: "var(--lp-surface)", color: "var(--lp-fg)" }} />
              </EditField>
              <EditField label="标签">
                <input value={editTags} onChange={(e) => setEditTags(e.target.value)} className="w-full px-3.5 py-2.5 text-sm rounded-lg outline-none" style={{ border: "1.5px solid var(--lp-border)", background: "var(--lp-surface)", color: "var(--lp-fg)" }} />
              </EditField>
            </div>
            <EditField label="备注">
              <textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} rows={3} className="w-full px-3.5 py-2.5 text-sm rounded-lg outline-none resize-y min-h-[80px] leading-[1.65]" style={{ border: "1.5px solid var(--lp-border)", background: "var(--lp-surface)", color: "var(--lp-fg)" }} />
            </EditField>
          </div>

          {/* Steps */}
          <div className="mb-6">
            <h3 className="text-sm font-bold mb-3 flex items-center gap-1.5" style={{ color: "var(--lp-fg)" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--lp-accent)" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>
              烹饪步骤
            </h3>
            <div className="flex flex-col gap-2">
              {editSteps.map((step, i) => (
                <div key={i} className="flex gap-3 items-start">
                  <div className="w-7 h-7 min-w-7 rounded-full grid place-items-center text-[13px] font-bold text-white mt-2" style={{ background: "var(--lp-accent)" }}>{i + 1}</div>
                  <input value={step} onChange={(e) => { const s = [...editSteps]; s[i] = e.target.value; setEditSteps(s); }}
                    className="flex-1 px-3.5 py-2.5 text-sm rounded-lg outline-none" style={{ border: "1.5px solid var(--lp-border)", background: "var(--lp-surface)", color: "var(--lp-fg)" }} />
                  <button onClick={() => setEditSteps(editSteps.filter((_, j) => j !== i))} className="mt-2 p-1" style={{ color: "var(--lp-muted)" }}>
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>
            <button onClick={() => setEditSteps([...editSteps, ""])}
              className="mt-3 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[13px] font-medium transition-all duration-150"
              style={{ border: "1.5px dashed var(--lp-border)", color: "var(--lp-muted)", background: "transparent" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              添加步骤
            </button>
          </div>

          {/* Image upload */}
          <div className="mb-6">
            <h3 className="text-sm font-bold mb-3" style={{ color: "var(--lp-fg)" }}>菜谱图片</h3>
            <ImageUpload images={editImages} onChange={setEditImages} maxImages={4} />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-5" style={{ borderTop: "1px solid var(--lp-border)" }}>
            <button onClick={handleSave} disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-[13px] font-semibold transition-all duration-150 disabled:opacity-50"
              style={{
                border: `1.5px solid ${saveSuccess ? "var(--lp-green)" : "var(--lp-border)"}`,
                background: saveSuccess ? "var(--lp-green-light)" : "var(--lp-surface)",
                color: saveSuccess ? "var(--lp-green)" : "var(--lp-fg-secondary, var(--lp-muted))",
              }}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : saveSuccess ? <Check size={14} /> : null}
              {saveSuccess ? "已保存 ✓" : "保存到我的菜谱"}
            </button>
            <Link href={`/packs/${post.id}`} target="_blank"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-[13px] font-semibold transition-all duration-150"
              style={{ border: "1.5px solid var(--lp-border)", background: "var(--lp-surface)", color: "var(--lp-fg-secondary, var(--lp-muted))" }}>
              查看原版菜谱
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function EditField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[13px] font-semibold mb-1.5" style={{ color: "var(--lp-fg)" }}>{label}</label>
      {children}
      {hint && <div className="text-xs mt-1" style={{ color: "var(--lp-muted)" }}>{hint}</div>}
    </div>
  );
}
