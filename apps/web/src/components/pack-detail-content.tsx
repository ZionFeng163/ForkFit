"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowLeft, Bookmark, Check, GitFork, Heart, MapPin, Send, Trash2 } from "lucide-react";

import { RemoteImage } from "@/components/remote-image";
import { ConfirmModal } from "@/components/confirm-modal";
import { useAuth } from "@/components/auth-provider";
import { Link } from "@/i18n/routing";
import {
  getPost,
  toggleLike,
  toggleSave,
  listComments,
  createComment,
  deleteComment,
  listPosts,
  type Comment,
} from "@/lib/api";
import type { RecipePost } from "@/types/forkfit";

const GRADIENTS = [
  "linear-gradient(135deg, #e8f5ee, #c8e6d5)",
  "linear-gradient(135deg, #fef0ec, #f9ddd4)",
  "linear-gradient(135deg, #eef4fd, #d4e4f9)",
  "linear-gradient(135deg, #fef9ec, #f5ecd0)",
  "linear-gradient(135deg, #f5eef8, #e4d5f0)",
];

function getGradient(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  return GRADIENTS[Math.abs(hash) % GRADIENTS.length];
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
  if (days < 30) return `${days} 天前`;
  const months = Math.floor(days / 30);
  return `${months} 个月前`;
}

interface PackDetailContentProps {
  post: RecipePost;
  locale: string;
}

export function PackDetailContent({ post, locale }: PackDetailContentProps) {
  const t = useTranslations("Pack");
  const tc = useTranslations("Comments");
  const { user } = useAuth();

  // Post state
  const [liked, setLiked] = useState(post.liked ?? false);
  const [saves, setSaves] = useState(post.saves);
  const [saved, setSaved] = useState(post.saved ?? false);

  // Ingredients
  const [checked, setChecked] = useState<Set<number>>(new Set());

  // Comments
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentTotal, setCommentTotal] = useState(post.comment_count ?? 0);
  const [commentLoading, setCommentLoading] = useState(true);
  const [commentText, setCommentText] = useState("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);

  // Related
  const [related, setRelated] = useState<RecipePost[]>([]);

  const recipe = post.recipe;
  const ingredients = recipe.ingredients.filter(
    (ing) => ing.toLowerCase().trim() !== post.title.toLowerCase().trim()
  );
  const hasLocation = post.location && post.location !== "unknown";
  const canEdit = user?.id === post.user_id;

  // Fetch fresh like/save state
  useEffect(() => {
    getPost(post.id).then((fresh) => {
      setLiked(fresh.liked ?? false);
      setSaves(fresh.saves);
      setSaved(fresh.saved ?? false);
    }).catch(() => {});
  }, [post.id]);

  // Fetch comments
  useEffect(() => {
    listComments(post.id).then((res) => {
      setComments(res.comments);
      setCommentTotal(res.total);
    }).finally(() => setCommentLoading(false));
  }, [post.id]);

  // Fetch related posts
  useEffect(() => {
    listPosts(4, 0).then((posts) => {
      setRelated(posts.filter((p) => p.id !== post.id).slice(0, 3));
    }).catch(() => {});
  }, [post.id]);

  function handleLike() {
    if (!user) return;
    toggleLike(post.id).then((res) => {
      setLiked(res.liked);
      setSaves(res.saves);
    });
  }

  function handleSave() {
    if (!user) return;
    toggleSave(post.id).then((res) => {
      setSaved(res.saved);
      setSaves(res.saves);
    });
  }

  function toggleIngredient(idx: number) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  function handleCommentSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!commentText.trim() || !user) return;
    setCommentSubmitting(true);
    createComment(post.id, commentText.trim()).then((c) => {
      setComments((prev) => [...prev, c]);
      setCommentTotal((prev) => prev + 1);
      setCommentText("");
    }).finally(() => setCommentSubmitting(false));
  }

  const [deleteCommentTarget, setDeleteCommentTarget] = useState<string | null>(null);

  function confirmCommentDelete() {
    if (!deleteCommentTarget) return;
    deleteComment(post.id, deleteCommentTarget).then(() => {
      setComments((prev) => prev.filter((c) => c.id !== deleteCommentTarget));
      setCommentTotal((prev) => prev - 1);
    });
    setDeleteCommentTarget(null);
  }

  return (
    <div className="mx-auto max-w-[1120px] px-7 pb-20">
      {/* Back link */}
      <div className="pt-6">
        <Link
          href="/discover"
          className="inline-flex items-center gap-1.5 text-[13px] font-medium transition-colors"
          style={{ color: "var(--lp-muted)" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--lp-accent)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--lp-muted)")}
        >
          <ArrowLeft size={16} />
          {locale === "en" ? "Back to discover" : "返回发现"}
        </Link>
      </div>

      {/* Hero image */}
      <div
        className="mt-7 rounded-xl overflow-hidden relative"
        style={{ aspectRatio: "16/9" }}
      >
        {post.image_urls.length > 0 ? (
          <RemoteImage src={post.image_urls[0]} alt={post.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full grid place-items-center" style={{ background: getGradient(post.id) }}>
            <svg width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="rgba(232,93,58,0.25)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2C6.48 2 2 6 2 10c0 2.5 1.5 5 4 6.5V22l4-2.5c.6.2 1.3.5 2 .5 5.52 0 10-4 10-8s-4.48-8-10-8z" />
            </svg>
          </div>
        )}
        {post.forks > 0 && (
          <div
            className="absolute top-4 left-4 text-white text-xs font-bold px-3.5 py-1.5 rounded-full"
            style={{ background: "var(--lp-accent)", letterSpacing: "0.03em" }}
          >
            {locale === "en" ? "Popular" : "热门菜谱"}
          </div>
        )}
      </div>

      {/* Recipe header */}
      <div className="pt-7 flex items-start justify-between gap-6 flex-wrap">
        <div>
          {/* Tags */}
          <div className="flex gap-1.5 flex-wrap mb-2.5">
            {post.theme && post.theme !== "community recipe" && (
              <span className="px-2.5 py-[3px] rounded-full text-xs font-semibold" style={{ background: "var(--lp-accent-light)", color: "var(--lp-accent)" }}>
                {post.theme}
              </span>
            )}
            {recipe.cook_time_minutes > 0 && (
              <span className="px-2.5 py-[3px] rounded-full text-xs font-semibold" style={{ background: "var(--lp-green-light)", color: "var(--lp-green)" }}>
                {recipe.cook_time_minutes} {locale === "en" ? "min" : "分钟"}
              </span>
            )}
            {recipe.tags.slice(0, 2).map((tag) => (
              <span key={tag} className="px-2.5 py-[3px] rounded-full text-xs font-semibold" style={{ background: "var(--lp-warm-100)", color: "var(--lp-fg-secondary, var(--lp-muted))" }}>
                {tag}
              </span>
            ))}
          </div>
          <h1 className="text-[28px] font-bold leading-[1.25] tracking-[-0.02em] mb-3" style={{ color: "var(--lp-fg)" }}>
            {post.title}
          </h1>
          <p className="text-[15px] leading-[1.65] max-w-[560px]" style={{ color: "var(--lp-muted)" }}>
            {post.description}
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2.5 items-center flex-wrap">
          <Link
            href={`/packs/${post.id}/fork`}
            className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full text-[13px] font-semibold text-white transition-all duration-200"
            style={{ background: "var(--lp-accent)" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--lp-accent-hover)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "var(--lp-accent)")}
          >
            <GitFork size={16} />
            {locale === "en" ? "Fork" : "复刻"}
          </Link>
          <button
            onClick={handleSave}
            className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full text-[13px] font-semibold transition-all duration-200"
            style={{
              border: `1px solid ${saved ? "var(--lp-green)" : "var(--lp-border)"}`,
              background: saved ? "var(--lp-green-light)" : "var(--lp-surface)",
              color: saved ? "var(--lp-green)" : "var(--lp-muted)",
            }}
          >
            <Bookmark size={16} className={saved ? "fill-current" : ""} />
            {saved ? (locale === "en" ? "Saved" : "已收藏") : (locale === "en" ? "Save" : "收藏")}
          </button>
          <button
            onClick={handleLike}
            className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full text-[13px] font-semibold transition-all duration-200"
            style={{
              border: `1px solid ${liked ? "#e0524a" : "var(--lp-border)"}`,
              background: liked ? "#fef0ef" : "var(--lp-surface)",
              color: liked ? "#e0524a" : "var(--lp-muted)",
            }}
          >
            <Heart size={16} className={liked ? "fill-current" : ""} />
            {saves}
          </button>
        </div>
      </div>

      {/* Author row */}
      <div className="flex items-center gap-3 py-5 mt-1" style={{ borderTop: "1px solid var(--lp-border)" }}>
        <div
          className="w-10 h-10 rounded-full grid place-items-center text-[15px] font-bold flex-shrink-0"
          style={{ background: "var(--lp-accent-soft)", color: "var(--lp-accent)" }}
        >
          {post.author?.[0] || "?"}
        </div>
        <div className="flex-1">
          <Link href={`/users/${post.user_id}`} className="text-sm font-semibold hover:underline" style={{ color: "var(--lp-fg)" }}>
            {post.author}
          </Link>
          <div className="flex items-center gap-2 text-xs" style={{ color: "var(--lp-muted)" }}>
            {hasLocation && (
              <>
                <span className="flex items-center gap-0.5">
                  <MapPin size={12} />
                  {post.location}
                </span>
                <span>·</span>
              </>
            )}
            {post.created_at && <span>{timeAgo(post.created_at)}发布</span>}
            <span>·</span>
            <span>{locale === "en" ? `Forked ${post.forks} times` : `复刻 ${post.forks} 次`}</span>
          </div>
        </div>
      </div>

      {/* Metrics bar */}
      <div className="flex gap-7 py-5" style={{ marginTop: "4px" }}>
        {recipe.cook_time_minutes > 0 && (
          <div className="flex flex-col items-center gap-1">
            <div className="w-10 h-10 rounded-[10px] grid place-items-center" style={{ background: "var(--lp-warm-100)" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--lp-muted)" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
            </div>
            <div className="text-base font-bold">{recipe.cook_time_minutes} {locale === "en" ? "min" : "分钟"}</div>
            <div className="text-[11px]" style={{ color: "var(--lp-muted)" }}>{locale === "en" ? "Cook time" : "烹饪时间"}</div>
          </div>
        )}
        <div className="flex flex-col items-center gap-1">
          <div className="w-10 h-10 rounded-[10px] grid place-items-center" style={{ background: "var(--lp-warm-100)" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--lp-muted)" strokeWidth="2"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
          </div>
          <div className="text-base font-bold">{locale === "en" ? "Medium" : "中等"}</div>
          <div className="text-[11px]" style={{ color: "var(--lp-muted)" }}>{locale === "en" ? "Difficulty" : "难度"}</div>
        </div>
        {recipe.ingredients.length > 0 && (
          <div className="flex flex-col items-center gap-1">
            <div className="w-10 h-10 rounded-[10px] grid place-items-center" style={{ background: "var(--lp-warm-100)" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--lp-muted)" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
            </div>
            <div className="text-base font-bold">{recipe.ingredients.length}</div>
            <div className="text-[11px]" style={{ color: "var(--lp-muted)" }}>{locale === "en" ? "Ingredients" : "食材"}</div>
          </div>
        )}
      </div>

      {/* Recipe body: Ingredients + Steps */}
      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-8 mt-8">
        {/* Ingredients panel */}
        <div className="rounded-xl p-6" style={{ background: "var(--lp-surface)", border: "1px solid var(--lp-border)" }}>
          <h3 className="text-base font-bold mb-4 flex items-center gap-2">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--lp-accent)" strokeWidth="2"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><line x1="3" y1="6" x2="21" y2="6" /><path d="M16 10a4 4 0 0 1-8 0" /></svg>
            {locale === "en" ? "Ingredients" : "食材清单"}
          </h3>
          {ingredients.length > 0 ? (
            <ul>
              {ingredients.map((ing, i) => (
                <li
                  key={i}
                  className="flex items-center gap-3 py-2.5 cursor-pointer"
                  style={{ borderBottom: i < ingredients.length - 1 ? "1px solid var(--lp-border)" : "none" }}
                  onClick={() => toggleIngredient(i)}
                >
                  <div
                    className="w-[18px] h-[18px] rounded flex-shrink-0 grid place-items-center transition-all duration-150"
                    style={{
                      border: `1.5px solid ${checked.has(i) ? "var(--lp-accent)" : "var(--lp-border)"}`,
                      background: checked.has(i) ? "var(--lp-accent)" : "transparent",
                    }}
                  >
                    {checked.has(i) && <Check size={12} color="white" strokeWidth={3} />}
                  </div>
                  <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: "var(--lp-accent)" }} />
                  <span className="text-sm flex-1" style={{ color: checked.has(i) ? "var(--lp-muted)" : "var(--lp-fg)", textDecoration: checked.has(i) ? "line-through" : "none" }}>
                    {ing}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm" style={{ color: "var(--lp-muted)" }}>{locale === "en" ? "No ingredients listed" : "暂无食材信息"}</p>
          )}

          {/* Equipment */}
          {recipe.equipment.length > 0 && (
            <div className="mt-5 pt-4" style={{ borderTop: "1px solid var(--lp-border)" }}>
              <div className="text-xs font-semibold mb-2 uppercase tracking-[0.06em]" style={{ color: "var(--lp-muted)" }}>
                {locale === "en" ? "Equipment" : "所需厨具"}
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {recipe.equipment.map((eq) => (
                  <span key={eq} className="px-3 py-1 rounded-full text-xs font-medium" style={{ background: "var(--lp-warm-100)", color: "var(--lp-fg-secondary, var(--lp-muted))" }}>
                    {eq}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Steps panel */}
        <div className="rounded-xl p-6" style={{ background: "var(--lp-surface)", border: "1px solid var(--lp-border)" }}>
          <h3 className="text-base font-bold mb-4 flex items-center gap-2">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--lp-accent)" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
            {locale === "en" ? "Cooking steps" : "烹饪步骤"}
          </h3>
          {recipe.steps && recipe.steps.length > 0 ? (
            <ol className="space-y-0">
              {recipe.steps.map((step, i) => (
                <li key={i} className="flex gap-4 py-5" style={{ borderBottom: i < recipe.steps.length - 1 ? "1px solid var(--lp-border)" : "none" }}>
                  <div
                    className="w-8 h-8 min-w-8 rounded-full grid place-items-center text-[13px] font-extrabold"
                    style={{ background: "var(--lp-accent-light)", color: "var(--lp-accent)" }}
                  >
                    {i + 1}
                  </div>
                  <div className="text-sm leading-[1.7] pt-1" style={{ color: "var(--lp-fg-secondary, var(--lp-muted))" }}>
                    {step}
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm" style={{ color: "var(--lp-muted)" }}>{locale === "en" ? "No steps provided" : "暂无步骤"}</p>
          )}

          {/* Notes */}
          {recipe.notes && recipe.notes.trim() && (
            <div className="mt-6 rounded-lg px-5 py-4 flex gap-2.5 items-start" style={{ background: "var(--lp-warm-100)" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--lp-muted)" strokeWidth="2" className="flex-shrink-0 mt-0.5"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
              <div className="text-[13px] leading-[1.6]" style={{ color: "var(--lp-fg-secondary, var(--lp-muted))" }}>
                {recipe.notes}
              </div>
            </div>
          )}

          {/* Edit link */}
          {canEdit && (
            <Link
              href={`/packs/${post.id}/edit`}
              className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium transition-colors"
              style={{ color: "var(--lp-accent)" }}
            >
              {locale === "en" ? "Edit recipe" : "编辑菜谱"} →
            </Link>
          )}
        </div>
      </div>

      {/* Comments */}
      <div className="mt-10 rounded-xl p-7" style={{ background: "var(--lp-surface)", border: "1px solid var(--lp-border)" }}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold">{locale === "en" ? "Comments" : "评论"}</h2>
          <span className="text-[13px]" style={{ color: "var(--lp-muted)" }}>{commentTotal} {locale === "en" ? "comments" : "条评论"}</span>
        </div>

        {/* Comment input */}
        {user ? (
          <form onSubmit={handleCommentSubmit} className="flex gap-2.5 mb-6">
            <div
              className="w-8 h-8 rounded-full grid place-items-center text-xs font-bold flex-shrink-0"
              style={{ background: "var(--lp-accent-soft)", color: "var(--lp-accent)" }}
            >
              {(user.display_name || user.username || "?")[0].toUpperCase()}
            </div>
            <div className="flex flex-1 gap-2">
              <input
                type="text"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder={tc("placeholder")}
                className="flex-1 h-[38px] rounded-lg px-3.5 text-[13px] outline-none transition-colors"
                style={{ border: "1px solid var(--lp-border)", background: "var(--lp-warm-100)", color: "var(--lp-fg)" }}
                onFocus={(e) => (e.currentTarget.style.borderColor = "var(--lp-accent)")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "var(--lp-border)")}
              />
              <button
                type="submit"
                disabled={!commentText.trim() || commentSubmitting}
                className="h-[38px] px-4 rounded-lg text-[13px] font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
                style={{ background: "var(--lp-fg)", color: "white" }}
              >
                <Send size={14} />
                {tc("send")}
              </button>
            </div>
          </form>
        ) : (
          <p className="mb-6 text-[13px]" style={{ color: "var(--lp-muted)" }}>{tc("loginToComment")}</p>
        )}

        {/* Comment list */}
        {commentLoading ? (
          <div className="py-8 text-center text-sm" style={{ color: "var(--lp-muted)" }}>Loading...</div>
        ) : comments.length === 0 ? (
          <p className="py-8 text-center text-[13px]" style={{ color: "var(--lp-muted)" }}>{tc("noComments")}</p>
        ) : (
          <ul>
            {comments.map((c) => (
              <li key={c.id} className="flex gap-2.5 py-4" style={{ borderBottom: "1px solid var(--lp-border)" }}>
                <div
                  className="w-8 h-8 rounded-full grid place-items-center text-xs font-bold flex-shrink-0"
                  style={{ background: "var(--lp-warm-100)", color: "var(--lp-muted)" }}
                >
                  {(c.display_name || c.username || "?")[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-xs mb-1" style={{ color: "var(--lp-muted)" }}>
                    <span className="font-semibold" style={{ color: "var(--lp-fg-secondary, var(--lp-muted))" }}>{c.display_name}</span>
                    <span>· {timeAgo(c.created_at)}</span>
                  </div>
                  <p className="text-[13px] leading-[1.6]" style={{ color: "var(--lp-fg-secondary, var(--lp-muted))" }}>{c.content}</p>
                  <div className="flex gap-3 mt-1.5">
                    {c.can_delete && (
                      <button
                        onClick={() => setDeleteCommentTarget(c.id)}
                        className="text-[11px] transition-colors"
                        style={{ color: "var(--lp-muted)" }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = "#9e3a2b")}
                        onMouseLeave={(e) => (e.currentTarget.style.color = "var(--lp-muted)")}
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Related recipes */}
      {related.length > 0 && (
        <div className="mt-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold">{locale === "en" ? "You might also like" : "你可能也喜欢"}</h2>
            <Link href="/discover" className="text-[13px] font-medium" style={{ color: "var(--lp-accent)" }}>
              {locale === "en" ? "View more" : "查看更多"}
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {related.map((rp) => (
              <Link key={rp.id} href={`/packs/${rp.id}`}>
                <div
                  className="rounded-xl overflow-hidden transition-all duration-200"
                  style={{ background: "var(--lp-surface)", border: "1px solid var(--lp-border)" }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = "translateY(-2px)";
                    e.currentTarget.style.boxShadow = "0 8px 28px rgba(26,23,20,0.08)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "none";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                >
                  <div className="relative overflow-hidden" style={{ aspectRatio: "16/10" }}>
                    {rp.image_urls.length > 0 ? (
                      <RemoteImage src={rp.image_urls[0]} alt={rp.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full grid place-items-center" style={{ background: getGradient(rp.id) }}>
                        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="rgba(232,93,58,0.3)" strokeWidth="1.5"><path d="M12 2C6.48 2 2 6 2 10c0 2.5 1.5 5 4 6.5V22l4-2.5c.6.2 1.3.5 2 .5 5.52 0 10-4 10-8s-4.48-8-10-8z" /></svg>
                      </div>
                    )}
                  </div>
                  <div className="px-4 pt-3.5 pb-3">
                    <div className="flex gap-1 flex-wrap mb-1.5">
                      {rp.recipe.tags.slice(0, 2).map((tag) => (
                        <span key={tag} className="px-2 py-[2px] rounded-full text-[11px] font-medium" style={{ background: "var(--lp-warm-100)", color: "var(--lp-muted)" }}>{tag}</span>
                      ))}
                    </div>
                    <h3 className="text-sm font-semibold leading-[1.35] mb-1.5" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                      {rp.title}
                    </h3>
                    <div className="flex items-center gap-2.5 text-xs" style={{ color: "var(--lp-muted)" }}>
                      {rp.recipe.cook_time_minutes > 0 && (
                        <span>{rp.recipe.cook_time_minutes} {locale === "en" ? "min" : "分钟"}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between px-4 py-2 text-xs" style={{ borderTop: "1px solid var(--lp-border)", color: "var(--lp-muted)" }}>
                    <span className="font-medium" style={{ color: "var(--lp-fg-secondary, var(--lp-muted))" }}>{rp.author}</span>
                    <span>{rp.forks} {locale === "en" ? "forks" : "次复刻"}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!deleteCommentTarget}
        title="删除评论"
        message="确定要删除这条评论吗？"
        confirmLabel="删除"
        danger
        onConfirm={confirmCommentDelete}
        onCancel={() => setDeleteCommentTarget(null)}
      />
    </div>
  );
}
