"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Bookmark, Check, ChevronLeft, ChevronRight, Clock3, Heart, MapPin, Pencil, Send, SlidersHorizontal, Trash2, Users } from "lucide-react";
import { useTranslations } from "next-intl";

import { useAuth } from "@/components/auth-provider";
import { ConfirmModal } from "@/components/confirm-modal";
import { PostCard } from "@/components/post-card";
import { RemoteImage } from "@/components/remote-image";
import { Link } from "@/i18n/routing";
import { createComment, deleteComment, getPost, listComments, listPosts, toggleLike, toggleSave, type Comment } from "@/lib/api";
import { getLocalizedLoginUrl } from "@/lib/auth-navigation";
import type { RecipePost } from "@/types/forkfit";

function timeAgo(value: string, locale: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return locale === "zh" ? "刚刚" : "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return locale === "zh" ? `${minutes} 分钟前` : `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return locale === "zh" ? `${hours} 小时前` : `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return locale === "zh" ? `${days} 天前` : `${days}d ago`;
}

export function PackDetailContent({ post, locale }: { post: RecipePost; locale: string }) {
  const tc = useTranslations("Comments");
  const { user } = useAuth();
  const recipe = post.recipe;
  const ingredients = recipe.ingredients.filter((item) => item.trim().toLowerCase() !== post.title.trim().toLowerCase());
  const [liked, setLiked] = useState(post.liked ?? false);
  const [likes, setLikes] = useState(post.likes ?? 0);
  const [saved, setSaved] = useState(post.saved ?? false);
  const [activeImage, setActiveImage] = useState(0);
  const [checkedIngredients, setCheckedIngredients] = useState<Set<number>>(new Set());
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentTotal, setCommentTotal] = useState(post.comment_count ?? 0);
  const [commentText, setCommentText] = useState("");
  const [commentLoading, setCommentLoading] = useState(true);
  const [commentLoadError, setCommentLoadError] = useState(false);
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [related, setRelated] = useState<RecipePost[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const galleryRef = useRef<HTMLDivElement>(null);
  const canEdit = user?.id === post.user_id;
  const isZh = locale === "zh";

  const scrollToImage = useCallback((index: number) => {
    const gallery = galleryRef.current;
    if (!gallery) return;
    const target = Math.max(0, Math.min(index, post.image_urls.length - 1));
    gallery.scrollTo({ left: gallery.clientWidth * target, behavior: "smooth" });
  }, [post.image_urls.length]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") scrollToImage(activeImage - 1);
      if (event.key === "ArrowRight") scrollToImage(activeImage + 1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeImage, scrollToImage]);

  useEffect(() => {
    getPost(post.id).then((fresh) => {
      setLiked(fresh.liked ?? false);
      setSaved(fresh.saved ?? false);
      setLikes(fresh.likes ?? post.likes ?? 0);
    }).catch(() => undefined);
    listComments(post.id).then((result) => {
      setComments(result.comments);
      setCommentTotal(result.total);
    }).catch(() => setCommentLoadError(true)).finally(() => setCommentLoading(false));
    listPosts(4, 0).then((items) => setRelated(items.filter((item) => item.id !== post.id).slice(0, 3))).catch(() => undefined);
  }, [isZh, post.id, post.likes]);

  function requireLogin() {
    window.location.assign(getLocalizedLoginUrl(window.location));
  }

  function handleLike() {
    if (!user) return requireLogin();
    setActionError(null);
    toggleLike(post.id).then((result) => {
      setLiked(result.liked);
      setLikes(result.likes);
    }).catch((error: Error) => setActionError(error.message || (isZh ? "操作失败" : "Action failed")));
  }

  function handleSave() {
    if (!user) return requireLogin();
    setActionError(null);
    toggleSave(post.id).then((result) => setSaved(result.saved)).catch((error: Error) => setActionError(error.message || (isZh ? "操作失败" : "Action failed")));
  }

  function submitComment(event: FormEvent) {
    event.preventDefault();
    if (!user) return requireLogin();
    const content = commentText.trim();
    if (!content) return;
    setCommentSubmitting(true);
    createComment(post.id, content).then((comment) => {
      setComments((current) => [...current, comment]);
      setCommentTotal((current) => current + 1);
      setCommentText("");
    }).catch((error: Error) => setActionError(error.message || (isZh ? "评论发送失败" : "Could not post comment"))).finally(() => setCommentSubmitting(false));
  }

  function deleteSelectedComment() {
    if (!deleteTarget) return;
    const id = deleteTarget;
    setDeleteTarget(null);
    deleteComment(post.id, id).then(() => {
      setComments((current) => current.filter((comment) => comment.id !== id));
      setCommentTotal((current) => Math.max(0, current - 1));
    }).catch((error: Error) => setActionError(error.message || (isZh ? "删除失败" : "Could not delete")));
  }

  function toggleIngredient(index: number) {
    setCheckedIngredients((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index); else next.add(index);
      return next;
    });
  }

  return (
    <div className="site-container pb-20 pt-6 md:pt-8">
      <Link href="/discover" className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--muted-text)] hover:text-[var(--text)]">
        <ArrowLeft size={16} />{isZh ? "返回发现" : "Back to discover"}
      </Link>

      <article className="mt-2 flex flex-col">
        <div className="relative h-[230px] overflow-hidden rounded-lg bg-[#e9e3da] sm:h-[360px] lg:h-[440px] xl:h-[460px]">
          {post.image_urls.length > 0 ? (
            <div
              ref={galleryRef}
              className="flex h-full snap-x snap-mandatory overflow-x-auto [scrollbar-width:none]"
              onScroll={(event) => {
                const element = event.currentTarget;
                if (element.clientWidth) setActiveImage(Math.round(element.scrollLeft / element.clientWidth));
              }}
            >
              {post.image_urls.map((url, index) => (
                <div key={`${url}-${index}`} className="h-full min-w-full snap-start">
                  <RemoteImage src={url} alt={`${post.title} ${index + 1}`} className="h-full w-full object-cover" priority={index === 0} />
                </div>
              ))}
            </div>
          ) : (
            <RemoteImage src="" alt={post.title} className="h-full w-full" />
          )}

          {post.image_urls.length > 1 && (
            <>
              <button type="button" onClick={() => scrollToImage(activeImage - 1)} disabled={activeImage === 0} className="absolute left-3 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-md bg-[var(--surface)] text-[var(--text)] shadow-[0_2px_8px_rgba(32,28,24,.12)] disabled:opacity-35" aria-label={isZh ? "上一张" : "Previous image"}><ChevronLeft size={20} /></button>
              <button type="button" onClick={() => scrollToImage(activeImage + 1)} disabled={activeImage === post.image_urls.length - 1} className="absolute right-3 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-md bg-[var(--surface)] text-[var(--text)] shadow-[0_2px_8px_rgba(32,28,24,.12)] disabled:opacity-35" aria-label={isZh ? "下一张" : "Next image"}><ChevronRight size={20} /></button>
              <span className="absolute bottom-3 right-3 rounded-md bg-[rgba(32,28,24,.76)] px-2.5 py-1 text-xs text-white">{activeImage + 1} / {post.image_urls.length}</span>
            </>
          )}
        </div>

        <header className="order-first grid gap-6 border-b border-[var(--line)] py-6 lg:grid-cols-[1fr_auto] lg:items-end">
          <div className="max-w-3xl">
            <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-[var(--muted-text)]">
              {recipe.tags.slice(0, 3).map((tag) => <span key={tag} className="font-semibold text-[var(--brand-hover)]">{tag}</span>)}
              {recipe.cook_time_minutes > 0 && <span className="flex items-center gap-1.5"><Clock3 size={15} />{recipe.cook_time_minutes} {isZh ? "分钟" : "min"}</span>}
              {post.location && post.location !== "unknown" && <span className="flex items-center gap-1.5"><MapPin size={15} />{post.location}</span>}
            </div>
            <h1 className="page-heading">{post.title}</h1>
            <p className="mt-4 max-w-2xl text-[15px] leading-7 text-[var(--muted-text)]">{post.description}</p>
            <div className="mt-5 flex items-center gap-3 text-sm">
              <Link href={`/users/${post.user_id}`} className="font-semibold hover:text-[var(--brand-hover)]">{post.author}</Link>
              {post.created_at && <span className="text-[var(--muted-text)]">{timeAgo(post.created_at, locale)}</span>}
              {post.source_url && <a href={post.source_url} target="_blank" rel="noreferrer" className="text-[var(--muted-text)] underline decoration-[var(--line)] underline-offset-4">{isZh ? "来源" : "Source"}</a>}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/packs/${post.id}/fork`} className="button-primary"><SlidersHorizontal size={17} />{isZh ? "按我的需求定制" : "Adapt to my needs"}</Link>
            <button type="button" className="button-secondary px-3" data-active={saved} onClick={handleSave} aria-label={isZh ? "收藏" : "Save"}><Bookmark size={17} className={saved ? "fill-current text-[var(--brand)]" : ""} /></button>
            <button type="button" className="button-secondary px-3" data-active={liked} onClick={handleLike} aria-label={isZh ? "点赞" : "Like"}><Heart size={17} className={liked ? "fill-current text-[var(--danger)]" : ""} />{likes}</button>
            {canEdit && <Link href={`/packs/${post.id}/edit`} className="button-secondary px-3" title={isZh ? "编辑" : "Edit"}><Pencil size={16} /></Link>}
          </div>
        </header>

        {actionError && (
          <div className="mt-5 flex items-center gap-3 rounded-lg border border-[var(--danger)] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">
            {actionError}<button type="button" className="ml-auto" onClick={() => setActionError(null)} aria-label={isZh ? "关闭" : "Close"}>×</button>
          </div>
        )}

        <div className="grid gap-10 py-9 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
          <div className="min-w-0">
            <section>
              <h2 className="section-heading">{isZh ? "制作步骤" : "Method"}</h2>
              {recipe.steps.length > 0 ? (
                <ol className="mt-5 divide-y divide-[var(--line)] border-t border-[var(--line)]">
                  {recipe.steps.map((step, index) => (
                    <li key={`${step}-${index}`} className="grid grid-cols-[38px_1fr] gap-4 py-5">
                      <span className="text-sm font-semibold text-[var(--brand)]">{String(index + 1).padStart(2, "0")}</span>
                      <p className="leading-7">{step}</p>
                    </li>
                  ))}
                </ol>
              ) : <p className="mt-4 text-[var(--muted-text)]">{isZh ? "暂无制作步骤" : "No method provided"}</p>}
            </section>

            {recipe.notes && (
              <section className="mt-9 border-l-2 border-[var(--brand)] pl-5">
                <h2 className="text-base font-bold">{isZh ? "小贴士" : "Notes"}</h2>
                <p className="mt-2 whitespace-pre-wrap leading-7 text-[var(--muted-text)]">{recipe.notes}</p>
              </section>
            )}
          </div>

          <aside className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-5 lg:sticky lg:top-5">
            <div className="flex items-center justify-between border-b border-[var(--line)] pb-4">
              <h2 className="section-heading">{isZh ? "食材" : "Ingredients"}</h2>
              <span className="flex items-center gap-1.5 text-xs text-[var(--muted-text)]"><Users size={14} />{isZh ? "按原菜谱份量" : "Original servings"}</span>
            </div>
            <ul className="divide-y divide-[var(--line)]">
              {ingredients.map((ingredient, index) => (
                <li key={`${ingredient}-${index}`}>
                  <button type="button" className="flex w-full items-start gap-3 py-3 text-left" onClick={() => toggleIngredient(index)}>
                    <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded border ${checkedIngredients.has(index) ? "border-[var(--success)] bg-[var(--success)] text-white" : "border-[var(--line)]"}`}>
                      {checkedIngredients.has(index) && <Check size={13} />}
                    </span>
                    <span className={checkedIngredients.has(index) ? "text-[var(--muted-text)] line-through" : ""}>{ingredient}</span>
                  </button>
                </li>
              ))}
            </ul>
            {recipe.equipment.length > 0 && (
              <div className="mt-5 border-t border-[var(--line)] pt-4">
                <h3 className="text-sm font-bold">{isZh ? "需要的厨具" : "Equipment"}</h3>
                <p className="mt-2 text-sm leading-6 text-[var(--muted-text)]">{recipe.equipment.join("、")}</p>
              </div>
            )}
          </aside>
        </div>
      </article>

      <section className="border-t border-[var(--line)] py-9">
        <h2 className="section-heading">{isZh ? `评论 ${commentTotal}` : `Comments ${commentTotal}`}</h2>
        {user ? (
          <form onSubmit={submitComment} className="mt-5 flex max-w-3xl items-end gap-3">
            <label className="flex-1">
              <span className="sr-only">{isZh ? "写评论" : "Write a comment"}</span>
              <textarea value={commentText} onChange={(event) => setCommentText(event.target.value)} className="min-h-24 w-full resize-y rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3.5 py-3 text-sm outline-none focus:border-[var(--focus)]" placeholder={tc("placeholder")} />
            </label>
            <button type="submit" className="button-primary" disabled={commentSubmitting || !commentText.trim()}><Send size={15} />{tc("send")}</button>
          </form>
        ) : (
          <button type="button" className="mt-4 text-sm font-semibold text-[var(--brand-hover)]" onClick={requireLogin}>{tc("loginToComment")}</button>
        )}

        <div className="mt-6 max-w-3xl">
          {commentLoading ? <p className="py-6 text-sm text-[var(--muted-text)]">{isZh ? "正在加载评论…" : "Loading comments…"}</p> : commentLoadError ? (
            <p className="border-t border-[var(--line)] py-6 text-sm text-[var(--muted-text)]">{isZh ? "评论暂时无法加载，请稍后再试。" : "Comments are temporarily unavailable."}</p>
          ) : comments.length === 0 ? <p className="py-6 text-sm text-[var(--muted-text)]">{tc("noComments")}</p> : (
            <ul className="divide-y divide-[var(--line)] border-t border-[var(--line)]">
              {comments.map((comment) => (
                <li key={comment.id} className="flex gap-3 py-5">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--brand-soft)] text-xs font-bold text-[var(--brand-hover)]">{(comment.display_name || comment.username || "?")[0].toUpperCase()}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-xs"><strong>{comment.display_name || comment.username}</strong><span className="text-[var(--muted-text)]">{timeAgo(comment.created_at, locale)}</span></div>
                    <p className="mt-2 whitespace-pre-wrap leading-6">{comment.content}</p>
                  </div>
                  {comment.can_delete && <button type="button" className="button-quiet h-8 min-h-8 px-2 text-[var(--danger)]" onClick={() => setDeleteTarget(comment.id)} aria-label={isZh ? "删除评论" : "Delete comment"}><Trash2 size={14} /></button>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {related.length > 0 && (
        <section className="border-t border-[var(--line)] pt-9">
          <div className="mb-5 flex items-center justify-between"><h2 className="section-heading">{isZh ? "你可能也喜欢" : "You might also like"}</h2><Link href="/discover" className="text-sm font-semibold text-[var(--brand-hover)]">{isZh ? "查看更多" : "View more"}</Link></div>
          <div className="grid gap-x-5 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">{related.map((item) => <PostCard key={item.id} post={item} />)}</div>
        </section>
      )}

      <div className="fixed inset-x-0 bottom-[calc(52px+env(safe-area-inset-bottom))] z-30 border-t border-[var(--line)] bg-[var(--surface)] p-3 sm:hidden">
        <Link href={`/packs/${post.id}/fork`} className="button-primary w-full"><SlidersHorizontal size={17} />{isZh ? "按我的需求定制" : "Adapt to my needs"}</Link>
      </div>

      <ConfirmModal open={Boolean(deleteTarget)} title={isZh ? "删除评论" : "Delete comment"} message={isZh ? "确定要删除这条评论吗？" : "Delete this comment?"} confirmLabel={isZh ? "删除" : "Delete"} danger onConfirm={deleteSelectedComment} onCancel={() => setDeleteTarget(null)} />
    </div>
  );
}
