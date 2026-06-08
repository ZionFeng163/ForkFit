"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft, Check, CheckCircle2, Loader2, X, Send,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { ImageUpload } from "@/components/image-upload";
import { Link, useRouter } from "@/i18n/routing";
import { getRun, publishRun, saveRun } from "@/lib/api";
import type { RunResultPayload } from "@/types/forkfit";

export function RunView({ runId }: { runId: string }) {
  const t = useTranslations("Run");
  const router = useRouter();

  const query = useQuery({
    queryKey: ["run", runId],
    queryFn: () => getRun(runId),
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return s === "running" || s === "queued" ? 1000 : false;
    },
  });

  const run = query.data;
  const result = run?.result;
  const forkedMeal = result?.forked_meal_pack?.meals?.[0];

  // Editable fields
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

  // Init fields from result
  useEffect(() => {
    if (!result || !forkedMeal) return;
    setEditTitle(result.forked_meal_pack.title || forkedMeal.name || "");
    setEditDesc(result.description || result.summary || "");
    setEditIngredients(forkedMeal.ingredients.join(", "));
    setEditEquipment(forkedMeal.equipment.join(", "));
    setEditCookTime(String(forkedMeal.cook_time_minutes || 30));
    setEditTags(forkedMeal.tags.join(", "));
    setEditNotes(forkedMeal.notes || "");
    setEditSteps(forkedMeal.steps?.length ? [...forkedMeal.steps] : []);
  }, [result]);

  async function handlePublish() {
    setPublishing(true);
    try {
      const splitList = (s: string) => s.split(/[,，]/).map((x) => x.trim()).filter(Boolean);
      const post = await publishRun(runId, {
        title: editTitle,
        description: editDesc,
        image_urls: editImages,
        recipe_name: editTitle,
        ingredients: splitList(editIngredients),
        equipment: splitList(editEquipment),
        cook_time_minutes: Number(editCookTime) || 30,
        tags: splitList(editTags),
        notes: editNotes,
        steps: editSteps,
      });
      setPublished(true);
      setTimeout(() => router.push(`/packs/${post.id}`), 1500);
    } catch (e: any) {
      setActionError(e.message || "发布失败，请稍后重试");
    }
    setPublishing(false);
  }

  async function handleSave() {
    setSaving(true);
    try { await saveRun(runId); } catch (e: any) { setActionError(e.message || "保存失败"); }
    setSaving(false);
  }

  // Loading / error states
  if (query.isLoading) {
    return (
      <div className="mx-auto max-w-[860px] px-7 pb-20">
        <div className="pt-6 flex justify-center py-20">
          <Loader2 size={24} className="animate-spin" style={{ color: "var(--lp-muted)" }} />
        </div>
      </div>
    );
  }

  if (!run || !result || !forkedMeal) {
    return (
      <div className="mx-auto max-w-[860px] px-7 pb-20">
        <div className="pt-6">
          <Link href="/my-forks" className="inline-flex items-center gap-1.5 text-sm font-medium" style={{ color: "var(--lp-muted)" }}>
            <ArrowLeft size={18} /> 返回我的定制
          </Link>
        </div>
        <div className="py-20 text-center text-sm" style={{ color: "var(--lp-muted)" }}>无法加载定制结果</div>
      </div>
    );
  }

  // Still running
  if (run.status === "queued" || run.status === "running") {
    return (
      <div className="mx-auto max-w-[860px] px-7 pb-20">
        <div className="pt-6">
          <Link href="/my-forks" className="inline-flex items-center gap-1.5 text-sm font-medium" style={{ color: "var(--lp-muted)" }}>
            <ArrowLeft size={18} /> 返回我的定制
          </Link>
        </div>
        <div className="py-20 text-center">
          <Loader2 size={32} className="animate-spin mx-auto mb-4" style={{ color: "var(--lp-accent)" }} />
          <div className="text-base font-semibold" style={{ color: "var(--lp-fg)" }}>定制中...</div>
          <div className="text-sm mt-1" style={{ color: "var(--lp-muted)" }}>AI 正在为你调整菜谱</div>
        </div>
      </div>
    );
  }

  // Failed
  if (run.status === "failed") {
    return (
      <div className="mx-auto max-w-[860px] px-7 pb-20">
        <div className="pt-6">
          <Link href="/my-forks" className="inline-flex items-center gap-1.5 text-sm font-medium" style={{ color: "var(--lp-muted)" }}>
            <ArrowLeft size={18} /> 返回我的定制
          </Link>
        </div>
        <div className="py-20 text-center">
          <div className="text-base font-semibold mb-2" style={{ color: "var(--lp-fg)" }}>定制失败</div>
          <div className="text-sm" style={{ color: "var(--lp-muted)" }}>{run.error?.message || "未知错误"}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[860px] px-7 pb-20">
      {/* Back */}
      <div className="pt-6 pb-4">
        <Link href="/my-forks" className="inline-flex items-center gap-1.5 text-sm font-medium transition-colors" style={{ color: "var(--lp-muted)" }}>
          <ArrowLeft size={18} /> 返回我的定制
        </Link>
      </div>

      {actionError && (
        <div className="mb-4 px-4 py-3 rounded-xl text-[13px] flex items-center gap-2" style={{ background: "#fef0ef", color: "#7f3525" }}>
          {actionError}
          <button onClick={() => setActionError(null)} className="ml-auto opacity-70 hover:opacity-100">×</button>
        </div>
      )}

      {/* Header + editable fields */}
      <div className="rounded-2xl p-6 mb-4" style={{ background: "var(--lp-surface)", border: "1px solid var(--lp-border)" }}>
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2 text-base font-bold" style={{ color: "var(--lp-fg)" }}>
            <CheckCircle2 size={20} style={{ color: "var(--lp-green)" }} /> 定制结果
          </div>
          <div className="flex gap-2">
            <Link href={`/packs/${result.original_meal_pack.id}`}
              className="px-4 py-2 rounded-lg text-[13px] font-semibold transition-all duration-150"
              style={{ background: "var(--lp-surface)", color: "var(--lp-fg-secondary, var(--lp-muted))", border: "1.5px solid var(--lp-border)" }}>
              查看原版
            </Link>
            <button onClick={handlePublish} disabled={publishing || published}
              className="px-4 py-2 rounded-lg text-[13px] font-semibold text-white transition-all duration-150 disabled:opacity-50"
              style={{ background: published ? "var(--lp-green)" : "var(--lp-accent)" }}>
              {publishing ? <Loader2 size={14} className="animate-spin inline" /> : null}
              {published ? "已发布 ✓" : "发布菜谱"}
            </button>
          </div>
        </div>

        <div className="space-y-4">
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
      {result.change_log.length > 0 && (
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
                {result.change_log.slice(0, 8).map((c, i) => (
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
            {[...new Set(result.change_log.map((c) => c.reason))].map((reason, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <span className="mt-1 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: "var(--lp-green)" }} />
                <span style={{ color: "var(--lp-fg-secondary, var(--lp-muted))" }}>{reason}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Final review */}
      {result.final_review && (
        <div className="rounded-2xl p-6 mb-4" style={{ background: "var(--lp-surface)", border: "1px solid var(--lp-border)" }}>
          <h3 className="text-sm font-bold mb-2" style={{ color: "var(--lp-fg)" }}>AI 评审</h3>
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium"
            style={{
              background: result.final_review.status === "pass" ? "var(--lp-green-light)" : "var(--lp-accent-light)",
              color: result.final_review.status === "pass" ? "var(--lp-green)" : "var(--lp-accent)",
            }}>
            {result.final_review.status === "pass" ? "通过" : result.final_review.status === "warn" ? "有建议" : "有问题"}
          </span>
          {result.final_review.findings.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {result.final_review.findings.map((f, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <span className="mt-1 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: "var(--lp-accent)" }} />
                  <span style={{ color: "var(--lp-fg-secondary, var(--lp-muted))" }}>{f.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="rounded-2xl p-6 mb-6" style={{ background: "var(--lp-surface)", border: "1px solid var(--lp-border)" }}>
        <div className="flex gap-3">
          <button onClick={handleSave} disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-[13px] font-semibold transition-all duration-150 disabled:opacity-50"
            style={{ border: "1.5px solid var(--lp-border)", background: "var(--lp-surface)", color: "var(--lp-fg-secondary, var(--lp-muted))" }}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : null} 保存到我的菜谱
          </button>
          <Link href={`/packs/${result.original_meal_pack.id}`}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-[13px] font-semibold transition-all duration-150"
            style={{ border: "1.5px solid var(--lp-border)", background: "var(--lp-surface)", color: "var(--lp-fg-secondary, var(--lp-muted))" }}>
            查看原版菜谱
          </Link>
        </div>
      </div>
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
