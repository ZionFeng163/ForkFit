"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  ArrowLeft, Check, CheckCircle2, ChevronDown,
  Loader2, Pencil, Send, Sparkles, Star,
} from "lucide-react";

import { RemoteImage } from "@/components/remote-image";
import { useAuth } from "@/components/auth-provider";
import { Link, useRouter } from "@/i18n/routing";
import {
  createRun, getRun, publishRun, saveRun, extractMyPreferences,
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

const QUICK_PILLS = [
  { label: "更辣一点" },
  { label: "减少食材" },
  { label: "素食版本" },
  { label: "缩短时间" },
  { label: "加番茄汤底" },
];

export function ForkContent({ post }: { post: RecipePost }) {
  const t = useTranslations("Fork");
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

  useEffect(() => {
    if (!runId || runStatus === "succeeded" || runStatus === "failed" || runStatus === "needs_input") return;
    const interval = setInterval(async () => {
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
    setChatMessages((prev) => [...prev, { role: "user", text: QUICK_PILLS[idx].label }]);
    setTimeout(() => {
      setChatMessages((prev) => [...prev, {
        role: "assistant",
        text: `好的，已为你「${QUICK_PILLS[idx].label}」。继续告诉我你还想怎么改？`,
      }]);
    }, 800);
  }

  async function handleSend() {
    if (!chatInput.trim()) return;
    const text = chatInput.trim();
    setChatInput("");
    setChatMessages((prev) => [...prev, { role: "user", text }]);

    if (!runId) {
      setCreating(true);
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
  }

  async function handleExtract() {
    setChatMessages((prev) => [...prev, { role: "user", text: "从我的帖子提取口味" }]);
    try {
      await extractMyPreferences("zh");
      setChatMessages((prev) => [...prev, { role: "assistant", text: "已从你之前的帖子中提取口味偏好并应用到这道菜。" }]);
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
      const published = await publishRun(runId);
      setPublished(true);
      setTimeout(() => router.push(`/packs/${published.id}`), 1500);
    } catch {}
    setPublishing(false);
  }

  async function handleSave() {
    if (!runId) return;
    setSaving(true);
    try { await saveRun(runId); } catch {}
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
          <Link href="/profile"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold transition-all duration-200"
            style={{ background: "var(--lp-surface)", color: "var(--lp-fg-secondary, var(--lp-muted))", border: "1.5px solid var(--lp-border)" }}>
            编辑口味偏好
          </Link>
        </div>
      )}

      {runError && (
        <div className="rounded-xl p-5 mb-6" style={{ border: "1px solid #e8a9a0", background: "#fff8f5" }}>
          <div className="text-sm font-semibold" style={{ color: "#7f3525" }}>定制失败：{runError}</div>
        </div>
      )}

      {/* Result */}
      {runResult && forkedMeal && (
        <div className="rounded-2xl p-6 mb-6" style={{ background: "var(--lp-surface)", border: "1px solid var(--lp-border)" }}>
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
              <button onClick={handlePublish} disabled={publishing}
                className="px-4 py-2 rounded-lg text-[13px] font-semibold text-white transition-all duration-150 disabled:opacity-50"
                style={{ background: "var(--lp-accent)" }}>
                {publishing ? <Loader2 size={14} className="animate-spin inline" /> : null} 发布菜谱
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
            <div>
              <h4 className="text-sm font-bold mb-3.5 flex items-center gap-1.5">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--lp-accent)" strokeWidth="2"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><line x1="3" y1="6" x2="21" y2="6" /></svg>
                食材清单
              </h4>
              <ul>
                {forkedMeal.ingredients.map((ing: string, i: number) => (
                  <li key={i} className="flex items-center justify-between py-2.5 cursor-pointer" style={{ borderBottom: "1px solid var(--lp-border)" }} onClick={() => toggleIngredientCheck(i)}>
                    <div className="flex items-center gap-3">
                      <div className="w-5 h-5 min-w-5 rounded-md grid place-items-center transition-all duration-150"
                        style={{ border: `1.5px solid ${resultChecked.has(i) ? "var(--lp-green)" : "var(--lp-border)"}`, background: resultChecked.has(i) ? "var(--lp-green)" : "transparent" }}>
                        {resultChecked.has(i) && <Check size={12} color="white" strokeWidth={3} />}
                      </div>
                      <span className="text-sm" style={{ color: resultChecked.has(i) ? "var(--lp-muted)" : "var(--lp-fg)", textDecoration: resultChecked.has(i) ? "line-through" : "none" }}>{ing}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-bold mb-3.5 flex items-center gap-1.5">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--lp-accent)" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>
                烹饪步骤
              </h4>
              {forkedMeal.steps?.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {forkedMeal.steps.map((step: string, i: number) => (
                    <div key={i} className="flex gap-3.5 p-4 rounded-xl" style={{ background: "var(--lp-warm-100)" }}>
                      <div className="w-7 h-7 min-w-7 rounded-full grid place-items-center text-[13px] font-bold text-white" style={{ background: "var(--lp-accent)" }}>{i + 1}</div>
                      <div className="text-sm leading-[1.7] pt-0.5" style={{ color: "var(--lp-fg-secondary, var(--lp-muted))" }}>{step}</div>
                    </div>
                  ))}
                </div>
              ) : <p className="text-sm" style={{ color: "var(--lp-muted)" }}>暂无步骤</p>}
              {forkedMeal.notes && (
                <div className="mt-4 px-4 py-3 rounded-xl" style={{ background: "rgba(232,93,58,0.06)", borderLeft: "3px solid var(--lp-accent)" }}>
                  <div className="text-[12px] leading-[1.6]" style={{ color: "var(--lp-fg-secondary, var(--lp-muted))" }}>{forkedMeal.notes}</div>
                </div>
              )}
            </div>
          </div>
          <div className="mt-5 pt-5 flex gap-3" style={{ borderTop: "1px solid var(--lp-border)" }}>
            <button onClick={handleSave} disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-[13px] font-semibold transition-all duration-150 disabled:opacity-50"
              style={{ border: "1.5px solid var(--lp-border)", background: "var(--lp-surface)", color: "var(--lp-fg-secondary, var(--lp-muted))" }}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : null} 保存到我的菜谱
            </button>
          </div>
        </div>
      )}

      {/* Related */}
      <div className="rounded-2xl p-6" style={{ background: "var(--lp-surface)", border: "1px solid var(--lp-border)" }}>
        <h2 className="text-base font-bold mb-5" style={{ color: "var(--lp-fg)" }}>你可能也想定制</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {["番茄牛腩煲", "菌菇养生锅", "酸汤肥牛"].map((name, i) => (
            <div key={i} className="rounded-xl overflow-hidden cursor-pointer transition-all duration-200" style={{ border: "1px solid var(--lp-border)" }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--lp-accent)"; e.currentTarget.style.boxShadow = "var(--lp-shadow-sm)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--lp-border)"; e.currentTarget.style.boxShadow = "none"; }}>
              <div className="h-[100px] grid place-items-center" style={{ background: GRADIENTS[i] }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke={["#e85d3a", "#2d8a56", "#c9a030"][i]} strokeWidth="1.2" opacity="0.5">
                  <path d="M12 2C6.48 2 2 6 2 10c0 2.5 1.5 5 4 6.5V22l4-2.5c.6.2 1.3.5 2 .5 5.52 0 10-4 10-8s-4.48-8-10-8z" />
                </svg>
              </div>
              <div className="px-3.5 py-3">
                <div className="text-[13px] font-semibold mb-1" style={{ color: "var(--lp-fg)" }}>{name}</div>
                <div className="flex gap-2.5 text-xs" style={{ color: "var(--lp-muted)" }}>
                  <span>{["45 分钟", "30 分钟", "20 分钟"][i]}</span>
                  <span>{["中等", "简单", "简单"][i]}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
