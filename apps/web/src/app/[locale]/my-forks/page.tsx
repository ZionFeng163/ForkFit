"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Plus, GitFork, Pencil, Eye } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { AuthGuard } from "@/components/auth-guard";
import { ConfirmModal } from "@/components/confirm-modal";
import { useAuth } from "@/components/auth-provider";
import { Link } from "@/i18n/routing";
import { listSavedRuns, unsaveRun } from "@/lib/api";
import type { RunStatusResponse } from "@/types/forkfit";

const GRADIENTS = [
  "linear-gradient(135deg, #fef9ec, #f5ecd0)",
  "linear-gradient(135deg, #e8f5ee, #c8e6d5)",
  "linear-gradient(135deg, #fef0ec, #f9ddd4)",
  "linear-gradient(135deg, #eef4fd, #d4e4f9)",
  "linear-gradient(135deg, #f5eef8, #e4d5f0)",
  "linear-gradient(135deg, #fef0ec, #f5cbb8)",
];
const STROKE_COLORS = ["#c9a030", "#2d8a56", "#e85d3a", "#4a8ac9", "#8a5dc9", "#e85d3a"];

function getGradient(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  const idx = Math.abs(hash) % GRADIENTS.length;
  return { gradient: GRADIENTS[idx], stroke: STROKE_COLORS[idx] };
}

function timeAgo(dateStr: string) {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const seconds = Math.floor((now - then) / 1000);
  if (seconds < 60) return "刚刚";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} 天前`;
  if (days < 30) return `${Math.floor(days / 7)} 周前`;
  return `${Math.floor(days / 30)} 个月前`;
}

type FilterType = "all" | "completed" | "in-progress" | "saved";

export default function MyForksPage() {
  const t = useTranslations("MyForks");
  const { user } = useAuth();
  const [runs, setRuns] = useState<RunStatusResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>("all");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    listSavedRuns().then(setRuns).finally(() => setLoading(false));
  }, [user]);

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(deleteTarget);
    setError(null);
    try {
      await unsaveRun(deleteTarget);
      setRuns((prev) => prev.filter((r) => r.run_id !== deleteTarget));
    } catch (e: any) {
      setError(e.message || "移除失败，请稍后重试");
    } finally {
      setDeleting(null);
      setDeleteTarget(null);
    }
  }

  const filtered = filter === "all" ? runs : runs.filter((r) => {
    if (filter === "completed") return r.status === "succeeded";
    if (filter === "in-progress") return r.status === "running" || r.status === "queued";
    if (filter === "saved") return r.saved;
    return true;
  });

  const completedCount = runs.filter((r) => r.status === "succeeded").length;
  const inProgressCount = runs.filter((r) => r.status === "running" || r.status === "queued").length;
  const savedCount = runs.filter((r) => r.saved).length;

  function getStatusInfo(run: RunStatusResponse): { label: string; class: string } {
    if (run.status === "succeeded") return { label: "已完成", class: "completed" };
    if (run.status === "running" || run.status === "queued") return { label: "进行中", class: "in-progress" };
    if (run.status === "failed") return { label: "失败", class: "failed" };
    if (run.saved) return { label: "已收藏", class: "saved" };
    return { label: run.status, class: "" };
  }

  function getChangeStats(run: RunStatusResponse) {
    const log = run.result?.change_log || [];
    let added = 0;
    let removed = 0;
    for (const c of log) {
      if (c.to_value && !c.from_value) added++;
      else if (!c.to_value && c.from_value) removed++;
      else if (c.from_value !== c.to_value) added++;
    }
    return { added, removed };
  }

  function getRunTitle(run: RunStatusResponse): string {
    const original = run.result?.original_meal_pack?.title || "";
    const forked = run.result?.forked_meal_pack?.title || run.result?.forked_meal_pack?.meals?.[0]?.name || "";
    if (original && forked && original !== forked) return `${original} → ${forked}`;
    return forked || original || run.run_id.slice(0, 20);
  }

  function getRunDesc(run: RunStatusResponse): string {
    return run.result?.summary || run.result?.description || "";
  }

  function getRunTags(run: RunStatusResponse): string[] {
    const tags = run.result?.forked_meal_pack?.meals?.[0]?.tags || [];
    return tags.slice(0, 3);
  }

  return (
    <AuthGuard>
      <AppShell>
        <div className="mx-auto max-w-[960px] px-7 pb-20">
          {/* Page header */}
          <div className="flex items-start justify-between gap-6 flex-wrap pt-8 pb-7" style={{ borderBottom: "1px solid var(--lp-border)" }}>
            <div>
              <h1 className="text-2xl font-bold tracking-[-0.01em] mb-1" style={{ color: "var(--lp-fg)" }}>
                {t("title")}
              </h1>
              <p className="text-sm" style={{ color: "var(--lp-muted)" }}>
                AI 帮你调整过的所有菜谱
              </p>
            </div>
            <Link
              href="/discover"
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-[13px] font-semibold text-white transition-all duration-150 flex-shrink-0"
              style={{ background: "var(--lp-accent)" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--lp-accent-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "var(--lp-accent)")}
            >
              <Plus size={14} />
              开始定制
            </Link>
          </div>

          {/* Filter bar */}
          <div className="flex items-center gap-2.5 py-5 flex-wrap">
            {([
              { key: "all" as FilterType, label: `全部 (${runs.length})` },
              { key: "completed" as FilterType, label: `已完成 (${completedCount})` },
              { key: "in-progress" as FilterType, label: `进行中 (${inProgressCount})` },
              { key: "saved" as FilterType, label: `已收藏 (${savedCount})` },
            ]).map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className="px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-all duration-150"
                style={{
                  border: `1px solid ${filter === f.key ? "var(--lp-accent)" : "var(--lp-border)"}`,
                  background: filter === f.key ? "var(--lp-accent)" : "var(--lp-surface)",
                  color: filter === f.key ? "white" : "var(--lp-fg-secondary, var(--lp-muted))",
                }}
              >
                {f.label}
              </button>
            ))}
            <div className="flex-1" />
            <span className="text-[13px]" style={{ color: "var(--lp-muted)" }}>
              共 {filtered.length} 个
            </span>
          </div>

          {/* Content */}
          {loading ? (
            <div className="py-20 text-center">
              <Loader2 size={24} className="animate-spin mx-auto" style={{ color: "var(--lp-muted)" }} />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-20 text-center">
              <div className="w-[72px] h-[72px] rounded-full grid place-items-center mx-auto mb-5" style={{ background: "var(--lp-warm-100)" }}>
                <GitFork size={32} style={{ color: "var(--lp-muted)" }} />
              </div>
              <h3 className="text-base font-semibold mb-1.5" style={{ color: "var(--lp-fg)" }}>
                {filter === "all" ? t("empty") : "没有符合条件的定制"}
              </h3>
              <p className="text-[13px] mb-5" style={{ color: "var(--lp-muted)" }}>
                {filter === "all" ? "去发现菜谱，开始你的第一次 AI 定制" : "尝试其他筛选条件"}
              </p>
              <Link
                href="/discover"
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-[13px] font-semibold text-white transition-all duration-150"
                style={{ background: "var(--lp-accent)" }}
              >
                <Plus size={14} /> 去发现菜谱
              </Link>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {filtered.map((run) => {
                const { gradient, stroke } = getGradient(run.run_id);
                const status = getStatusInfo(run);
                const changes = getChangeStats(run);
                const tags = getRunTags(run);

                return (
                  <div
                    key={run.run_id}
                    className="grid gap-5 items-center p-4 rounded-xl transition-all duration-150 cursor-pointer"
                    style={{
                      gridTemplateColumns: "140px 1fr auto",
                      background: "var(--lp-surface)",
                      border: "1px solid var(--lp-border)",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = "translateY(-1px)";
                      e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.05)";
                      e.currentTarget.style.borderColor = "var(--lp-muted)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = "none";
                      e.currentTarget.style.boxShadow = "none";
                      e.currentTarget.style.borderColor = "var(--lp-border)";
                    }}
                  >
                    {/* Thumbnail */}
                    <Link href={`/runs/${run.run_id}`} className="w-[140px] h-[96px] rounded-lg overflow-hidden grid place-items-center flex-shrink-0 relative" style={{ background: gradient }}>
                      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.5" opacity="0.4">
                        <path d="M12 2C6.48 2 2 6 2 10c0 2.5 1.5 5 4 6.5V22l4-2.5c.6.2 1.3.5 2 .5 5.52 0 10-4 10-8s-4.48-8-10-8z" />
                      </svg>
                      <span className="absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-[3px] rounded-full text-[10px] font-semibold"
                        style={{ background: "rgba(255,255,255,0.92)", backdropFilter: "blur(6px)", color: "var(--lp-accent)" }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="var(--lp-accent)"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
                        AI 定制
                      </span>
                    </Link>

                    {/* Info */}
                    <Link href={`/runs/${run.run_id}`} className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className="inline-flex items-center gap-1 px-2 py-[2px] rounded-full text-[11px] font-semibold"
                          style={{
                            background: status.class === "completed" ? "var(--lp-green-light)" : status.class === "in-progress" ? "var(--blue-light, #eef4fd)" : status.class === "saved" ? "var(--purple-light, #f3eef8)" : "var(--lp-warm-100)",
                            color: status.class === "completed" ? "var(--lp-green)" : status.class === "in-progress" ? "var(--blue, #3b82f6)" : status.class === "saved" ? "var(--purple, #8b5cf6)" : "var(--lp-muted)",
                          }}
                        >
                          <span className="w-1.5 h-1.5 rounded-full" style={{
                            background: status.class === "completed" ? "var(--lp-green)" : status.class === "in-progress" ? "var(--blue, #3b82f6)" : status.class === "saved" ? "var(--purple, #8b5cf6)" : "var(--lp-muted)",
                          }} />
                          {status.label}
                        </span>
                      </div>
                      <div className="text-base font-semibold leading-[1.3] mb-1 truncate" style={{ color: "var(--lp-fg)" }}>
                        {getRunTitle(run)}
                      </div>
                      {getRunDesc(run) && (
                        <div className="text-[13px] leading-[1.5] mb-2 line-clamp-2" style={{ color: "var(--lp-muted)" }}>
                          {getRunDesc(run)}
                        </div>
                      )}
                      {tags.length > 0 && (
                        <div className="flex gap-1.5 flex-wrap">
                          <span className="px-2 py-[2px] rounded-full text-[11px] font-medium"
                            style={{ background: "var(--lp-accent-light)", color: "var(--lp-accent)" }}>
                            AI 定制
                          </span>
                          {tags.map((tag) => (
                            <span key={tag} className="px-2 py-[2px] rounded-full text-[11px] font-medium"
                              style={{ background: "var(--lp-warm-100)", color: "var(--lp-fg-secondary, var(--lp-muted))" }}>
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </Link>

                    {/* Meta + actions */}
                    <div className="flex flex-col items-end gap-2 min-w-[120px]">
                      {(changes.added > 0 || changes.removed > 0) && (
                        <div className="flex gap-3">
                          {changes.added > 0 && (
                            <div className="flex flex-col items-center gap-0.5">
                              <span className="text-base font-bold" style={{ color: "var(--lp-green)", fontVariantNumeric: "tabular-nums" }}>+{changes.added}</span>
                              <span className="text-[11px]" style={{ color: "var(--lp-muted)" }}>新增</span>
                            </div>
                          )}
                          {changes.removed > 0 && (
                            <div className="flex flex-col items-center gap-0.5">
                              <span className="text-base font-bold" style={{ color: "var(--lp-accent)", fontVariantNumeric: "tabular-nums" }}>-{changes.removed}</span>
                              <span className="text-[11px]" style={{ color: "var(--lp-muted)" }}>移除</span>
                            </div>
                          )}
                        </div>
                      )}
                      <span className="text-xs" style={{ color: "var(--lp-muted)" }}>
                        定制于 {timeAgo(run.created_at)}
                      </span>
                      <div className="flex gap-1">
                        {run.status === "succeeded" && (
                          <Link
                            href={`/runs/${run.run_id}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150"
                            style={{ background: "var(--lp-accent)", color: "white" }}
                          >
                            <GitFork size={12} /> 复刻
                          </Link>
                        )}
                        {run.status === "running" || run.status === "queued" ? (
                          <Link
                            href={`/packs/${run.result?.original_meal_pack?.id || ""}/fork`}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-150"
                            style={{ border: "1px solid var(--lp-border)", background: "var(--lp-surface)", color: "var(--lp-fg-secondary, var(--lp-muted))" }}
                          >
                            <Pencil size={12} /> 继续定制
                          </Link>
                        ) : null}
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeleteTarget(run.run_id); }}
                          disabled={deleting === run.run_id}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 disabled:opacity-50"
                          style={{ border: "1px solid var(--lp-border)", background: "var(--lp-surface)", color: "var(--lp-fg-secondary, var(--lp-muted))" }}
                        >
                          {deleting === run.run_id ? <Loader2 size={12} className="animate-spin" /> : <Eye size={12} />}
                          移除
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {error && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] px-5 py-3 rounded-xl text-sm font-medium text-white" style={{ background: "#e0524a" }}>
            {error}
            <button onClick={() => setError(null)} className="ml-3 opacity-70 hover:opacity-100">×</button>
          </div>
        )}

        <ConfirmModal
          open={!!deleteTarget}
          title="移除定制"
          message="确定要从我的定制中移除吗？"
          confirmLabel="移除"
          danger
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      </AppShell>
    </AuthGuard>
  );
}
