"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  ArrowLeft, Check, CheckCircle2, ChevronDown,
  Loader2, Pencil, Send, Sparkles, Star, X,
} from "lucide-react";

import { RemoteImage } from "@/components/remote-image";
import { ImageUpload } from "@/components/image-upload";
import { useAuth } from "@/components/auth-provider";
import { Link, useRouter } from "@/i18n/routing";
import {
  createRun, getRun, publishRun, saveRun, extractMyPreferences, listPosts,
} from "@/lib/api";
import {
  loadUserProfileForm,
  profileFormToUserProfile,
} from "@/lib/user-profile";
import type { MealPack, RecipePost, RunResultPayload } from "@/types/forkfit";

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

const QUICK_PILLS = [
  { label: "更辣一点" },
  { label: "减少食材" },
  { label: "素食版本" },
  { label: "缩短时间" },
  { label: "加番茄汤底" },
];

export function ForkContent({ post }: { post: RecipePost }) {
  const t = useTranslations("Fork");
  const locale = useLocale();
  const router = useRouter();
  const { user } = useAuth();
  const firstMeal = post.recipe;

  const [runId, setRunId] = useState<string | null>(null);
  const [runStatus, setRunStatus] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<RunResultPayload | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [customizeOpen, setCustomizeOpen] = useState(true);
  const [chatMessages, setChatMessages] = useState<{ role: "assistant" | "user"; text: string }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [activePills, setActivePills] = useState<Set<number>>(new Set());
  const chatRef = useRef<HTMLDivElement>(null);

  const [resultChecked, setResultChecked] = useState<Set<number>>(new Set());
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [relatedPosts, setRelatedPosts] = useState<RecipePost[]>([]);

  // Fetch related posts
  useEffect(() => {
    listPosts(4, 0).then((posts) => {
      setRelatedPosts(posts.filter((p) => p.id !== post.id).slice(0, 3));
    }).catch(() => {});
  }, [post.id]);

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

  // Initialize edit fields from result
  useEffect(() => {
    if (!runResult || !forkedMeal) return;
    setEditTitle(runResult.forked_meal_pack.title || forkedMeal.name || "");
    setEditDesc(runResult.description || runResult.summary || "");
    setEditIngredients(forkedMeal.ingredients.join(", "));
    setEditEquipment(forkedMeal.equipment.join(", "));
    setEditCookTime(String(forkedMeal.cook_time_minutes || 30));
    setEditTags(forkedMeal.tags.join(", "));
    setEditNotes(forkedMeal.notes || "");
    setEditSteps(forkedMeal.steps?.length ? [...forkedMeal.steps] : []);
    setEditImages([]);
    setResultChecked(new Set());
  }, [runResult]);

  useEffect(() => {
    if (!runId || runStatus === "succeeded" || runStatus === "failed" || runStatus === "needs_input") return;
    let pollCount = 0;
    const MAX_POLLS = 120; // 2 minutes at 1s interval
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
          setChatMessages((prev) => [...prev, {
            role: "assistant",
            text: `定制完成！${run.result!.summary || "查看下方的食材和步骤变化。"}`,
          }]);
        } else if (run.status === "failed") {
          setRunError(run.error?.message || "定制失败");
        }
      } catch {}
    }, 1000);
    return () => clearInterval(interval);
  }, [runId, runStatus]);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [chatMessages]);

  function togglePill(idx: number) {
    setActivePills((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
    const pillText = QUICK_PILLS[idx].label;
    setChatMessages((prev) => [...prev, { role: "user", text: pillText }]);
    // Always create a new run with this pill as the request
    setCreating(true);
    setRunResult(null);
    setRunError(null);
    const profile = loadUserProfileForm();
    createRun({
      user_profile: profileFormToUserProfile(profile),
      meal_pack: { id: post.id, title: post.title, theme: post.theme, meals: [firstMeal] },
      locale: "zh",
    }).then((resp) => {
      setRunId(resp.run_id);
      setRunStatus(resp.status);
      setChatMessages((prev) => [...prev, { role: "assistant", text: `好的，AI 正在根据「${pillText}」为你调整这道菜，请稍候...` }]);
    }).catch((e) => {
      setChatMessages((prev) => [...prev, { role: "assistant", text: `定制失败：${e.message}` }]);
    }).finally(() => setCreating(false));
  }

  async function handleSend() {
    if (!chatInput.trim()) return;
    const text = chatInput.trim();
    setChatInput("");
    setChatMessages((prev) => [...prev, { role: "user", text }]);

    // Always create a new run with the user's message
    setCreating(true);
    setRunResult(null);
    setRunError(null);
    try {
      const profile = loadUserProfileForm();
      const resp = await createRun({
        user_profile: profileFormToUserProfile(profile),
        meal_pack: { id: post.id, title: post.title, theme: post.theme, meals: [firstMeal] },
        locale: "zh",
      });
      setRunId(resp.run_id);
      setRunStatus(resp.status);
      setChatMessages((prev) => [...prev, { role: "assistant", text: "AI 正在根据你的要求定制这道菜，请稍候..." }]);
    } catch (err: any) {
      setChatMessages((prev) => [...prev, { role: "assistant", text: `定制失败：${err.message}` }]);
    }
    setCreating(false);
  }

  async function handleExtract() {
    setChatMessages((prev) => [...prev, { role: "user", text: "从我的帖子提取口味" }]);
    try {
      const result = await extractMyPreferences("zh");
      const prefs = result.preferences;
      const summary = [];
      if (prefs.likes) summary.push(`喜欢：${Array.isArray(prefs.likes) ? prefs.likes.join("、") : prefs.likes}`);
      if (prefs.dislikes) summary.push(`不喜欢：${Array.isArray(prefs.dislikes) ? prefs.dislikes.join("、") : prefs.dislikes}`);
      if (prefs.allergies) summary.push(`过敏：${Array.isArray(prefs.allergies) ? prefs.allergies.join("、") : prefs.allergies}`);
      if (prefs.diet_rules) summary.push(`饮食限制：${Array.isArray(prefs.diet_rules) ? prefs.diet_rules.join("、") : prefs.diet_rules}`);
      const msg = summary.length > 0
        ? `已从你之前的帖子中提取口味偏好：\n${summary.join("\n")}\n\n已应用到这道菜的定制中。`
        : "已从你之前的帖子中提取口味偏好并应用到这道菜。";
      setChatMessages((prev) => [...prev, { role: "assistant", text: msg }]);
    } catch {
      setChatMessages((prev) => [...prev, { role: "assistant", text: "提取失败，请稍后重试。" }]);
    }
  }

  function handleStartCustomize() {
    if (!runId) {
      setChatInput("开始定制");
      setTimeout(() => handleSend(), 100);
    }
  }

  async function handlePublish() {
    if (!runId) return;
    setPublishing(true);
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
      setActionError(e.message || "发布失败，请稍后重试");
    }
    setPublishing(false);
  }

  async function handleSave() {
    if (!runId) return;
    setSaving(true);
    try { await saveRun(runId); } catch (e: any) { setActionError(e.message || "保存失败"); }
    setSaving(false);
  }

  function toggleIngredientCheck(idx: number) {
    setResultChecked((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  }

  const forkedMeal = runResult?.forked_meal_pack?.meals?.[0];
  const isRunning = runStatus === "queued" || runStatus === "running";

  return (
    <div className="mx-auto max-w-[860px] px-7 pb-20">
      {/* Back + badge */}
      <div className="flex items-center justify-between pt-6 pb-4">
        <Link href={`/packs/${post.id}`} className="inline-flex items-center gap-1.5 text-sm font-medium transition-colors" style={{ color: "var(--lp-muted)" }}>
          <ArrowLeft size={18} /> 返回详情
        </Link>
        {isRunning && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold" style={{ background: "var(--lp-accent-light)", color: "var(--lp-accent)" }}>
            <Star size={14} /> AI 定制中
          </span>
        )}
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
          <div className="absolute top-4 left-4 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold" style={{ background: "rgba(255,255,255,0.92)", backdropFilter: "blur(8px)", color: "var(--lp-accent)", boxShadow: "var(--lp-shadow-sm)" }}>
            <Star size={14} /> AI 推荐菜谱
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
          <p className="text-[15px] leading-[1.6] max-w-[560px]" style={{ color: "var(--lp-fg-secondary, var(--lp-muted))" }}>{post.description}</p>
          {firstMeal.ingredients.length > 0 && (
            <div className="mt-5 pt-5" style={{ borderTop: "1px solid var(--lp-border)" }}>
              <div className="text-xs font-semibold uppercase tracking-[0.08em] mb-2.5" style={{ color: "var(--lp-muted)" }}>主要食材</div>
              <div className="flex flex-wrap gap-2">
                {firstMeal.ingredients.slice(0, 8).map((ing: string, i: number) => (
                  <span key={i} className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[13px] font-medium" style={{ background: "var(--lp-warm-100)", color: "var(--lp-fg-secondary, var(--lp-muted))" }}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--lp-accent)", opacity: 0.6 }} />
                    {ing}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* AI Chat */}
      <div className="rounded-2xl overflow-hidden mb-6" style={{ background: "var(--lp-surface)", border: "1px solid var(--lp-border)" }}>
        <div className="flex items-center justify-between px-6 py-5 cursor-pointer transition-colors" onClick={() => setCustomizeOpen(!customizeOpen)}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--lp-warm-100)")} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
          <div className="flex items-center gap-3">
            <Pencil size={20} style={{ color: "var(--lp-accent)" }} />
            <div>
              <div className="text-[15px] font-semibold" style={{ color: "var(--lp-fg)" }}>快速调整</div>
              <div className="text-[13px]" style={{ color: "var(--lp-muted)" }}>告诉 AI 你想怎么改</div>
            </div>
          </div>
          <ChevronDown size={20} style={{ color: "var(--lp-muted)", transition: "transform 0.25s", transform: customizeOpen ? "rotate(180deg)" : "rotate(0deg)" }} />
        </div>
        {customizeOpen && (
          <div className="px-6 pb-6">
            <div className="text-[13px] font-semibold mb-3" style={{ color: "var(--lp-fg-secondary, var(--lp-muted))" }}>一键调整</div>
            <div className="flex flex-wrap gap-2 mb-5">
              {QUICK_PILLS.map((pill, i) => (
                <button key={i} onClick={() => togglePill(i)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-medium transition-all duration-150"
                  style={{
                    background: activePills.has(i) ? "var(--lp-accent-light)" : "var(--lp-warm-100)",
                    border: `1.5px solid ${activePills.has(i) ? "var(--lp-accent)" : "transparent"}`,
                    color: activePills.has(i) ? "var(--lp-accent)" : "var(--lp-fg-secondary, var(--lp-muted))",
                  }}>
                  {pill.label}
                </button>
              ))}
            </div>
            <div ref={chatRef} className="rounded-xl p-5 mb-4 overflow-y-auto" style={{ background: "var(--lp-warm-100)", maxHeight: "320px" }}>
              {chatMessages.length === 0 && <div className="text-center text-sm py-4" style={{ color: "var(--lp-muted)" }}>AI 已准备好帮你定制这道菜</div>}
              {chatMessages.map((msg, i) => (
                <div key={i} className={`flex gap-2.5 mb-3.5 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                  <div className="w-7 h-7 min-w-7 rounded-full grid place-items-center text-[11px] font-bold"
                    style={{ background: msg.role === "assistant" ? "var(--lp-accent)" : "var(--lp-surface)", color: msg.role === "assistant" ? "white" : "var(--lp-fg-secondary, var(--lp-muted))", border: msg.role === "user" ? "1px solid var(--lp-border)" : "none" }}>
                    {msg.role === "assistant" ? "AI" : (user?.display_name?.[0] || "我")}
                  </div>
                  <div className="px-4 py-2.5 text-sm leading-[1.6] max-w-[80%] rounded-2xl whitespace-pre-line"
                    style={{
                      background: msg.role === "assistant" ? "var(--lp-surface)" : "var(--lp-accent)",
                      color: msg.role === "assistant" ? "var(--lp-fg)" : "white",
                      border: msg.role === "assistant" ? "1px solid var(--lp-border)" : "none",
                      borderBottomLeftRadius: msg.role === "assistant" ? "4px" : undefined,
                      borderBottomRightRadius: msg.role === "user" ? "4px" : undefined,
                    }}>
                    {msg.text}
                  </div>
                </div>
              ))}
              {creating && (
                <div className="flex gap-2.5 mb-3.5">
                  <div className="w-7 h-7 min-w-7 rounded-full grid place-items-center text-[11px] font-bold" style={{ background: "var(--lp-accent)", color: "white" }}>AI</div>
                  <div className="px-4 py-3 rounded-2xl" style={{ background: "var(--lp-surface)", border: "1px solid var(--lp-border)" }}>
                    <div className="flex gap-1">
                      {[0, 150, 300].map((d) => (
                        <span key={d} className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "var(--lp-muted)", animationDelay: `${d}ms` }} />
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                placeholder="比如：少放盐、换成鸡胸肉、多加蔬菜…"
                className="flex-1 h-[42px] px-4 rounded-xl text-sm outline-none transition-colors"
                style={{ border: "1.5px solid var(--lp-border)", background: "var(--lp-surface)", color: "var(--lp-fg)" }}
                onFocus={(e) => (e.currentTarget.style.borderColor = "var(--lp-accent)")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "var(--lp-border)")} />
              <button onClick={handleSend} className="w-[42px] h-[42px] rounded-xl grid place-items-center text-white transition-colors"
                style={{ background: "var(--lp-accent)" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--lp-accent-hover)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "var(--lp-accent)")}>
                <Send size={18} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Action buttons */}
      {!runResult && (
        <div className="flex gap-3 flex-wrap mb-6">
          <button onClick={handleStartCustomize} disabled={creating || isRunning}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white transition-all duration-200 disabled:opacity-50"
            style={{ background: "var(--lp-accent)", boxShadow: "0 2px 8px rgba(232,93,58,0.25)" }}>
            {creating || isRunning ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
            开始定制
          </button>
          <button onClick={handleExtract}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold transition-all duration-200"
            style={{ background: "var(--lp-surface)", color: "var(--lp-fg-secondary, var(--lp-muted))", border: "1.5px solid var(--lp-border)" }}>
            <Sparkles size={18} /> 从我的帖子提取口味
          </button>
          <button
            type="button"
            onClick={() => {
              setCustomizeOpen(true);
              setChatMessages((prev) => [...prev, {
                role: "assistant",
                text: "你可以在下方直接告诉我你的口味偏好，比如「不吃香菜」、「喜欢酸辣」、「不要内脏」，我会记住并在以后的定制中自动应用。",
              }]);
            }}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold transition-all duration-200"
            style={{ background: "var(--lp-surface)", color: "var(--lp-fg-secondary, var(--lp-muted))", border: "1.5px solid var(--lp-border)" }}>
            编辑口味偏好
          </button>
        </div>
      )}

      {runError && (
        <div className="rounded-xl p-5 mb-6" style={{ border: "1px solid #e8a9a0", background: "#fff8f5" }}>
          <div className="text-sm font-semibold" style={{ color: "#7f3525" }}>定制失败：{runError}</div>
        </div>
      )}

      {/* Result */}
      {runResult && forkedMeal && (
        <>
          {/* Header + actions */}
          <div className="rounded-2xl p-6 mb-4" style={{ background: "var(--lp-surface)", border: "1px solid var(--lp-border)" }}>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2 text-base font-bold" style={{ color: "var(--lp-fg)" }}>
                <CheckCircle2 size={20} style={{ color: "var(--lp-green)" }} /> 定制完成
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setRunResult(null); setRunId(null); setRunStatus(null); setChatMessages([]); }}
                  className="px-4 py-2 rounded-lg text-[13px] font-semibold transition-all duration-150"
                  style={{ background: "var(--lp-surface)", color: "var(--lp-fg-secondary, var(--lp-muted))", border: "1.5px solid var(--lp-border)" }}>
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
              <div className="mb-4 px-4 py-3 rounded-xl text-[13px] flex items-center gap-2" style={{ background: "#fef0ef", color: "#7f3525" }}>
                {actionError}
                <button onClick={() => setActionError(null)} className="ml-auto opacity-70 hover:opacity-100">×</button>
              </div>
            )}

            {/* Editable fields */}
            <div className="space-y-4">
              <EditField label="标题">
                <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="form-input w-full px-3.5 py-2.5 text-sm rounded-lg outline-none" style={{ border: "1.5px solid var(--lp-border)", background: "var(--lp-surface)", color: "var(--lp-fg)" }} />
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
          </div>

          {/* Editable steps */}
          <div className="rounded-2xl p-6 mb-4" style={{ background: "var(--lp-surface)", border: "1px solid var(--lp-border)" }}>
            <h3 className="text-sm font-bold mb-4 flex items-center gap-1.5" style={{ color: "var(--lp-fg)" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--lp-accent)" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>
              烹饪步骤
            </h3>
            <div className="flex flex-col gap-3">
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
          <div className="rounded-2xl p-6 mb-4" style={{ background: "var(--lp-surface)", border: "1px solid var(--lp-border)" }}>
            <h3 className="text-sm font-bold mb-3" style={{ color: "var(--lp-fg)" }}>菜谱图片</h3>
            <ImageUpload images={editImages} onChange={setEditImages} maxImages={4} />
          </div>

          {/* Comparison table */}
          {runResult.change_log.length > 0 && (
            <div className="rounded-2xl p-6 mb-4" style={{ background: "var(--lp-surface)", border: "1px solid var(--lp-border)" }}>
              <h3 className="text-sm font-bold mb-3" style={{ color: "var(--lp-fg)" }}>调整对比</h3>
              <div className="overflow-hidden rounded-lg" style={{ border: "1px solid var(--lp-border)" }}>
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ background: "var(--lp-warm-100)" }}>
                      <th className="px-3 py-2 text-left font-medium" style={{ color: "var(--lp-muted)" }}>项目</th>
                      <th className="px-3 py-2 text-left font-medium" style={{ color: "var(--lp-muted)" }}>原版</th>
                      <th className="px-3 py-2 text-left font-medium" style={{ color: "var(--lp-muted)" }}>定制版</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runResult.change_log.slice(0, 8).map((c, i) => (
                      <tr key={i} className="border-t" style={{ borderColor: "var(--lp-border)", background: "var(--lp-green-light)" }}>
                        <td className="px-3 py-2 font-medium" style={{ color: "var(--lp-fg)" }}>{c.affected_item}</td>
                        <td className="px-3 py-2 line-through" style={{ color: "var(--lp-muted)" }}>{c.from_value?.slice(0, 40) || "—"}</td>
                        <td className="px-3 py-2 font-semibold" style={{ color: "var(--lp-green)" }}>{c.to_value?.slice(0, 40) || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 space-y-1.5">
                {[...new Set(runResult.change_log.map((c) => c.reason))].map((reason, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <span className="mt-1 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: "var(--lp-green)" }} />
                    <span style={{ color: "var(--lp-fg-secondary, var(--lp-muted))" }}>{reason}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Final review */}
          {runResult.final_review && (
            <div className="rounded-2xl p-6 mb-4" style={{ background: "var(--lp-surface)", border: "1px solid var(--lp-border)" }}>
              <h3 className="text-sm font-bold mb-2" style={{ color: "var(--lp-fg)" }}>AI 评审</h3>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium"
                style={{
                  background: runResult.final_review.status === "pass" ? "var(--lp-green-light)" : "var(--lp-accent-light)",
                  color: runResult.final_review.status === "pass" ? "var(--lp-green)" : "var(--lp-accent)",
                }}>
                {runResult.final_review.status === "pass" ? "通过" : runResult.final_review.status === "warn" ? "有建议" : "有问题"}
              </span>
              {runResult.final_review.findings.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  {runResult.final_review.findings.map((f, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <span className="mt-1 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: "var(--lp-accent)" }} />
                      <span style={{ color: "var(--lp-fg-secondary, var(--lp-muted))" }}>{f.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Save + actions */}
          <div className="rounded-2xl p-6 mb-6" style={{ background: "var(--lp-surface)", border: "1px solid var(--lp-border)" }}>
            <div className="flex gap-3">
              <button onClick={handleSave} disabled={saving}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-[13px] font-semibold transition-all duration-150 disabled:opacity-50"
                style={{ border: "1.5px solid var(--lp-border)", background: "var(--lp-surface)", color: "var(--lp-fg-secondary, var(--lp-muted))" }}>
                {saving ? <Loader2 size={14} className="animate-spin" /> : null} 保存到我的菜谱
              </button>
              <Link href={`/packs/${runResult.original_meal_pack.id}`}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-[13px] font-semibold transition-all duration-150"
                style={{ border: "1.5px solid var(--lp-border)", background: "var(--lp-surface)", color: "var(--lp-fg-secondary, var(--lp-muted))" }}>
                查看原版菜谱
              </Link>
            </div>
          </div>
        </>
      )}

      {/* Related */}
      {relatedPosts.length > 0 && (
        <div className="rounded-2xl p-6" style={{ background: "var(--lp-surface)", border: "1px solid var(--lp-border)" }}>
          <h2 className="text-base font-bold mb-5" style={{ color: "var(--lp-fg)" }}>
            {locale === "en" ? "You might also want to customize" : "你可能也想定制"}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {relatedPosts.map((rp) => {
              const { gradient, stroke } = getGradient(rp.id);
              return (
                <Link key={rp.id} href={`/packs/${rp.id}/fork`}>
                  <div className="rounded-xl overflow-hidden transition-all duration-200" style={{ border: "1px solid var(--lp-border)" }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--lp-accent)"; e.currentTarget.style.boxShadow = "var(--lp-shadow-sm)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--lp-border)"; e.currentTarget.style.boxShadow = "none"; }}>
                    <div className="h-[100px] grid place-items-center" style={{ background: gradient }}>
                      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.2" opacity="0.5">
                        <path d="M12 2C6.48 2 2 6 2 10c0 2.5 1.5 5 4 6.5V22l4-2.5c.6.2 1.3.5 2 .5 5.52 0 10-4 10-8s-4.48-8-10-8z" />
                      </svg>
                    </div>
                    <div className="px-3.5 py-3">
                      <div className="text-[13px] font-semibold mb-1" style={{ color: "var(--lp-fg)" }}>{rp.title}</div>
                      <div className="flex gap-2.5 text-xs" style={{ color: "var(--lp-muted)" }}>
                        {rp.recipe.cook_time_minutes > 0 && <span>{rp.recipe.cook_time_minutes} 分钟</span>}
                        <span>{rp.forks} 次复刻</span>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
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
