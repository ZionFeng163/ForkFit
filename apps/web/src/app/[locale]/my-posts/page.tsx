"use client";

import { useEffect, useState } from "react";
import { Edit3, Loader2, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { AppShell } from "@/components/app-shell";
import { AuthGuard } from "@/components/auth-guard";
import { ConfirmModal } from "@/components/confirm-modal";
import { RemoteImage } from "@/components/remote-image";
import { useAuth } from "@/components/auth-provider";
import { Link } from "@/i18n/routing";
import { deletePost, listUserPosts } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import type { RecipePost } from "@/types/forkfit";

export default function MyPostsPage() {
  const t = useTranslations("MyPosts");
  const { user } = useAuth();
  const [posts, setPosts] = useState<RecipePost[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "published" | "draft">("all");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    listUserPosts(user.id, 100, 0).then((result) => setPosts(result.posts)).catch((reason: Error) => setError(reason.message)).finally(() => setLoading(false));
  }, [user]);

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deletePost(deleteTarget);
      setPosts((current) => current.filter((post) => post.id !== deleteTarget));
      setDeleteTarget(null);
    } catch (reason: unknown) {
      setError(errorMessage(reason, "删除失败，请稍后重试"));
    } finally {
      setDeleting(false);
    }
  }

  const filtered = filter === "all" ? posts : posts.filter((post) => (post.status ?? "published") === filter);
  const counts = {
    published: posts.filter((post) => (post.status ?? "published") === "published").length,
    draft: posts.filter((post) => post.status === "draft").length,
  };

  return (
    <AuthGuard>
      <AppShell>
        <div className="site-container max-w-[980px] pb-20 pt-8">
          <header className="flex flex-wrap items-end justify-between gap-5 border-b border-[var(--line)] pb-6">
            <div><h1 className="page-heading">{t("title")}</h1><p className="mt-2 text-sm text-[var(--muted-text)]">管理草稿和已经发布的菜谱</p></div>
            <Link href="/posts/new" className="button-primary"><Plus size={16} />发布菜谱</Link>
          </header>

          <div className="category-tabs">
            {[
              { key: "all" as const, label: `全部 ${posts.length}` },
              { key: "published" as const, label: `已发布 ${counts.published}` },
              { key: "draft" as const, label: `草稿 ${counts.draft}` },
            ].map((item) => <button key={item.key} type="button" className="category-tab" data-active={filter === item.key} onClick={() => setFilter(item.key)}>{item.label}</button>)}
          </div>

          {error && <div className="status-panel mt-6 border-[var(--danger)] text-sm text-[var(--danger)]">{error}</div>}
          {loading ? (
            <div className="py-20"><Loader2 className="mx-auto animate-spin text-[var(--muted-text)]" /></div>
          ) : filtered.length === 0 ? (
            <div className="py-20 text-center"><h2 className="text-lg font-bold">{t("empty")}</h2><p className="mt-2 text-sm text-[var(--muted-text)]">发布你的第一道菜谱，让其他人也能照着做。</p><Link href="/posts/new" className="button-primary mt-5"><Plus size={16} />发布菜谱</Link></div>
          ) : (
            <div className="divide-y divide-[var(--line)] border-b border-[var(--line)]">
              {filtered.map((post) => (
                <article key={post.id} className="grid gap-4 py-5 sm:grid-cols-[152px_1fr_auto] sm:items-center">
                  <Link href={`/packs/${post.id}`} className="h-28 overflow-hidden rounded-lg bg-[var(--surface-container-high)] sm:h-24"><RemoteImage src={post.image_urls[0] ?? ""} alt={post.title} className="h-full w-full object-cover" /></Link>
                  <div className="min-w-0">
                    <div className="mb-1 text-xs font-semibold text-[var(--brand-hover)]">{post.status === "draft" ? "草稿" : "已发布"}</div>
                    <h2 className="truncate text-base font-bold"><Link href={`/packs/${post.id}`} className="hover:text-[var(--brand-hover)]">{post.title}</Link></h2>
                    <p className="mt-1 line-clamp-1 text-sm text-[var(--muted-text)]">{post.description}</p>
                    <div className="mt-2 flex gap-4 text-xs text-[var(--muted-text)]"><span>{post.forks} 次定制</span><span>{post.likes} 赞</span><span>{post.comment_count ?? 0} 评论</span></div>
                  </div>
                  <div className="flex gap-2 sm:justify-end">
                    <Link href={`/packs/${post.id}/edit`} className="button-secondary h-9 min-h-9 px-3"><Edit3 size={15} />编辑</Link>
                    <button type="button" className="button-secondary h-9 min-h-9 px-3 text-[var(--danger)]" onClick={() => setDeleteTarget(post.id)}><Trash2 size={15} />删除</button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>

        <ConfirmModal open={Boolean(deleteTarget)} title="删除帖子" message="确定要删除这篇帖子吗？此操作不可撤销。" confirmLabel={deleting ? "删除中…" : "删除"} danger onConfirm={confirmDelete} onCancel={() => setDeleteTarget(null)} />
      </AppShell>
    </AuthGuard>
  );
}
