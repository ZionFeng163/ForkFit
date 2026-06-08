"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Plus } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { AuthGuard } from "@/components/auth-guard";
import { ConfirmModal } from "@/components/confirm-modal";
import { useAuth } from "@/components/auth-provider";
import { Link } from "@/i18n/routing";
import { listUserPosts } from "@/lib/api";
import type { RecipePost } from "@/types/forkfit";

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

export default function MyPostsPage() {
  const t = useTranslations("MyPosts");
  const { user } = useAuth();
  const [posts, setPosts] = useState<RecipePost[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "published" | "draft">("all");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    listUserPosts(user.id, 100, 0)
      .then((res) => setPosts(res.posts))
      .finally(() => setLoading(false));
  }, [user]);

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(deleteTarget);
    try {
      const { deletePost } = await import("@/lib/api");
      await deletePost(deleteTarget);
      setPosts((prev) => prev.filter((p) => p.id !== deleteTarget));
    } finally {
      setDeleting(null);
      setDeleteTarget(null);
    }
  }

  const filtered = filter === "all" ? posts : posts.filter((p) => {
    // All posts from API are "published" since there's no draft status yet
    return filter === "published";
  });

  const publishedCount = posts.length;
  const draftCount = 0;

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
                管理你发布的所有菜谱
              </p>
            </div>
            <Link
              href="/posts/new"
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-[13px] font-semibold text-white transition-all duration-150 flex-shrink-0"
              style={{ background: "var(--lp-accent)" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--lp-accent-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "var(--lp-accent)")}
            >
              <Plus size={14} />
              发布菜谱
            </Link>
          </div>

          {/* Filter bar */}
          <div className="flex items-center gap-2.5 py-5 flex-wrap">
            {([
              { key: "all" as const, label: `全部 (${posts.length})` },
              { key: "published" as const, label: `已发布 (${publishedCount})` },
              { key: "draft" as const, label: `草稿 (${draftCount})` },
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
              共 {filtered.length} 篇
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
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--lp-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
              </div>
              <h3 className="text-base font-semibold mb-1.5" style={{ color: "var(--lp-fg)" }}>
                {filter === "draft" ? "没有草稿" : t("empty")}
              </h3>
              <p className="text-[13px] mb-5" style={{ color: "var(--lp-muted)" }}>
                {filter === "draft" ? "所有帖子都已发布" : "发布你的第一道菜谱吧"}
              </p>
              <Link
                href="/posts/new"
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-[13px] font-semibold text-white transition-all duration-150"
                style={{ background: "var(--lp-accent)" }}
              >
                <Plus size={14} />
                发布菜谱
              </Link>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {filtered.map((post) => {
                const { gradient, stroke } = getGradient(post.id);
                const tags = post.recipe.tags.slice(0, 3);
                return (
                  <div
                    key={post.id}
                    className="grid gap-5 items-center p-4 rounded-xl transition-all duration-150 cursor-pointer"
                    style={{
                      gridTemplateColumns: "120px 1fr auto",
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
                    <Link href={`/packs/${post.id}`} className="w-[120px] h-[80px] rounded-lg overflow-hidden grid place-items-center flex-shrink-0" style={{ background: gradient }}>
                      {post.image_urls.length > 0 ? (
                        <img src={post.image_urls[0]} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.5" opacity="0.4">
                          <path d="M12 2C6.48 2 2 6 2 10c0 2.5 1.5 5 4 6.5V22l4-2.5c.6.2 1.3.5 2 .5 5.52 0 10-4 10-8s-4.48-8-10-8z" />
                        </svg>
                      )}
                    </Link>

                    {/* Info */}
                    <Link href={`/packs/${post.id}`} className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="inline-flex items-center gap-1 px-2 py-[2px] rounded-full text-[11px] font-semibold"
                          style={{ background: "var(--lp-green-light)", color: "var(--lp-green)" }}>
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--lp-green)" }} />
                          已发布
                        </span>
                      </div>
                      <div className="text-base font-semibold leading-[1.3] mb-1 truncate" style={{ color: "var(--lp-fg)" }}>
                        {post.title}
                      </div>
                      <div className="text-[13px] leading-[1.5] mb-2 line-clamp-2" style={{ color: "var(--lp-muted)" }}>
                        {post.description}
                      </div>
                      {tags.length > 0 && (
                        <div className="flex gap-1.5 flex-wrap">
                          {tags.map((tag) => (
                            <span key={tag} className="px-2 py-[2px] rounded-full text-[11px] font-medium"
                              style={{ background: "var(--lp-warm-100)", color: "var(--lp-fg-secondary, var(--lp-muted))" }}>
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </Link>

                    {/* Stats + actions */}
                    <div className="flex flex-col items-end gap-2 min-w-[100px]">
                      <div className="flex gap-4">
                        <div className="flex flex-col items-center gap-0.5">
                          <span className="text-base font-bold" style={{ fontVariantNumeric: "tabular-nums" }}>{post.forks}</span>
                          <span className="text-[11px]" style={{ color: "var(--lp-muted)" }}>复刻</span>
                        </div>
                        <div className="flex flex-col items-center gap-0.5">
                          <span className="text-base font-bold" style={{ fontVariantNumeric: "tabular-nums" }}>{post.saves}</span>
                          <span className="text-[11px]" style={{ color: "var(--lp-muted)" }}>点赞</span>
                        </div>
                        <div className="flex flex-col items-center gap-0.5">
                          <span className="text-base font-bold" style={{ fontVariantNumeric: "tabular-nums" }}>{post.comment_count ?? 0}</span>
                          <span className="text-[11px]" style={{ color: "var(--lp-muted)" }}>评论</span>
                        </div>
                      </div>
                      {post.created_at && (
                        <span className="text-xs" style={{ color: "var(--lp-muted)" }}>
                          {timeAgo(post.created_at)}发布
                        </span>
                      )}
                      <div className="flex gap-1">
                        <Link
                          href={`/packs/${post.id}/edit`}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-150"
                          style={{ border: "1px solid var(--lp-border)", background: "var(--lp-surface)", color: "var(--lp-fg-secondary, var(--lp-muted))" }}
                          onClick={(e) => e.stopPropagation()}
                          onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--lp-accent)"; e.currentTarget.style.color = "var(--lp-accent)"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--lp-border)"; e.currentTarget.style.color = "var(--lp-fg-secondary, var(--lp-muted))"; }}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                          编辑
                        </Link>
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeleteTarget(post.id); }}
                          disabled={deleting === post.id}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 disabled:opacity-50"
                          style={{ border: "1px solid var(--lp-border)", background: "var(--lp-surface)", color: "var(--lp-fg-secondary, var(--lp-muted))" }}
                          onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#e44"; e.currentTarget.style.color = "#e44"; e.currentTarget.style.background = "#fef2f2"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--lp-border)"; e.currentTarget.style.color = "var(--lp-fg-secondary, var(--lp-muted))"; e.currentTarget.style.background = "var(--lp-surface)"; }}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                          删除
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <ConfirmModal
          open={!!deleteTarget}
          title="删除帖子"
          message="确定要删除这篇帖子吗？此操作不可撤销。"
          confirmLabel="删除"
          danger
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      </AppShell>
    </AuthGuard>
  );
}
