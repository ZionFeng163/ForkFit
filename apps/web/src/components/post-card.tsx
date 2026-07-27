"use client";

import { Clock3, Heart, MessageSquare } from "lucide-react";
import { useLocale } from "next-intl";
import { useState } from "react";

import { CommentModal } from "@/components/comment-modal";
import { RemoteImage } from "@/components/remote-image";
import { useAuth } from "@/components/auth-provider";
import { Link } from "@/i18n/routing";
import { getLocalizedLoginUrl } from "@/lib/auth-navigation";
import { toggleLike } from "@/lib/api";
import type { RecipePost } from "@/types/forkfit";

export function PostCard({ post, compact = false }: { post: RecipePost; compact?: boolean }) {
  const locale = useLocale();
  const { user } = useAuth();
  const [likeState, setLikeState] = useState({ liked: post.liked ?? false, likes: post.likes ?? 0 });
  const [showComments, setShowComments] = useState(false);
  const [commentCount, setCommentCount] = useState(post.comment_count ?? 0);
  const [busy, setBusy] = useState(false);
  const primaryTag = post.recipe.tags[0] || post.theme;

  function handleLike() {
    if (!user) {
      window.location.assign(getLocalizedLoginUrl(window.location));
      return;
    }
    if (busy) return;
    setBusy(true);
    toggleLike(post.id)
      .then((result) => setLikeState({ liked: result.liked, likes: result.likes }))
      .finally(() => setBusy(false));
  }

  return (
    <article className={`recipe-card ${compact ? "lg:grid lg:grid-cols-[132px_1fr] lg:gap-4 lg:pb-5" : ""}`}>
      <Link href={`/packs/${post.id}`} className="block" aria-label={post.title}>
        <div className={`recipe-card-media ${compact ? "lg:aspect-square" : ""}`}>
          <RemoteImage src={post.image_urls[0] ?? ""} alt={post.title} className="h-full w-full object-cover" />
        </div>
      </Link>

      <div className="recipe-card-body flex min-w-0 flex-col">
        <div className="min-w-0">
          {primaryTag && primaryTag !== "community recipe" && <span className="recipe-label">{primaryTag}</span>}
          <h3 className="recipe-card-title">
            <Link href={`/packs/${post.id}`}>{post.title}</Link>
          </h3>
        </div>
        <div className="recipe-card-meta mt-auto">
          {post.recipe.cook_time_minutes > 0 && (
            <span className="inline-flex items-center gap-1"><Clock3 size={13} />{post.recipe.cook_time_minutes} {locale === "zh" ? "分钟" : "min"}</span>
          )}
          <span className="truncate">{post.author}</span>
          <div className="recipe-card-actions">
            <button
              type="button"
              className="recipe-icon-button"
              data-active={likeState.liked}
              onClick={handleLike}
              disabled={busy}
              aria-label={locale === "zh" ? "点赞" : "Like"}
            >
              <Heart size={14} className={likeState.liked ? "fill-current" : ""} />{likeState.likes}
            </button>
            <button
              type="button"
              className="recipe-icon-button"
              onClick={() => setShowComments(true)}
              aria-label={locale === "zh" ? "评论" : "Comments"}
            >
              <MessageSquare size={14} />{commentCount}
            </button>
          </div>
        </div>
      </div>

      {showComments && (
        <CommentModal
          postId={post.id}
          onClose={() => setShowComments(false)}
          onCommentCountChange={(delta) => setCommentCount((count) => count + delta)}
        />
      )}
    </article>
  );
}
