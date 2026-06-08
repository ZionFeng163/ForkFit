"use client";

import { useEffect, useState } from "react";
import { Heart, MessageSquare } from "lucide-react";

import { RemoteImage } from "@/components/remote-image";
import { Link } from "@/i18n/routing";
import { useAuth } from "@/components/auth-provider";
import { toggleLike } from "@/lib/api";
import { CommentModal } from "@/components/comment-modal";
import type { RecipePost } from "@/types/forkfit";

const GRADIENTS = [
  "linear-gradient(135deg, #e8f5ee, #c8e6d5)",
  "linear-gradient(135deg, #fef0ec, #f9ddd4)",
  "linear-gradient(135deg, #eef4fd, #d4e4f9)",
  "linear-gradient(135deg, #fef9ec, #f5ecd0)",
  "linear-gradient(135deg, #f5eef8, #e4d5f0)",
  "linear-gradient(135deg, #fef0ec, #f5cbb8)",
  "linear-gradient(135deg, #e8f5ee, #a8dbb8)",
  "linear-gradient(135deg, #fef9ec, #f5e0a8)",
];

const STROKE_COLORS = ["#2d8a56", "#e85d3a", "#4a8ac9", "#c9a030", "#8a5dc9", "#e85d3a", "#2d8a56", "#c9a030"];

function getGradient(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  const idx = Math.abs(hash) % GRADIENTS.length;
  return { gradient: GRADIENTS[idx], stroke: STROKE_COLORS[idx] };
}

export function PostCard({ post }: { post: RecipePost }) {
  const tags = post.recipe.tags.slice(0, 2);
  const { user } = useAuth();
  const [liked, setLiked] = useState(post.liked ?? false);
  const [saves, setSaves] = useState(post.saves);
  const [showComments, setShowComments] = useState(false);

  useEffect(() => {
    setLiked(post.liked ?? false);
    setSaves(post.saves);
  }, [post.liked, post.saves]);

  function handleLike(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!user) return;
    toggleLike(post.id).then((res) => {
      setLiked(res.liked);
      setSaves(res.saves);
    });
  }

  const hasImage = post.image_urls.length > 0;
  const { gradient, stroke } = getGradient(post.id);

  return (
    <div
      className="overflow-hidden cursor-pointer transition-all duration-200"
      style={{
        background: "var(--lp-surface)",
        borderRadius: "var(--radius, 12px)",
        border: "1px solid var(--lp-border)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-3px)";
        e.currentTarget.style.boxShadow = "0 8px 28px rgba(26,23,20,0.08)";
        e.currentTarget.style.borderColor = "var(--lp-muted)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "none";
        e.currentTarget.style.boxShadow = "none";
        e.currentTarget.style.borderColor = "var(--lp-border)";
      }}
    >
      <Link href={`/packs/${post.id}`} className="block">
        {/* Image area */}
        <div className="relative overflow-hidden" style={{ aspectRatio: "4/3" }}>
          {hasImage ? (
            <RemoteImage
              src={post.image_urls[0]}
              alt={post.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div
              className="w-full h-full grid place-items-center"
              style={{ background: gradient }}
            >
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.5" opacity="0.3">
                <path d="M12 2C6.48 2 2 6 2 10c0 2.5 1.5 5 4 6.5V22l4-2.5c.6.2 1.3.5 2 .5 5.52 0 10-4 10-8s-4.48-8-10-8z" />
              </svg>
            </div>
          )}
          {/* Fork badge */}
          {post.forks > 0 && (
            <div
              className="absolute top-2.5 right-2.5 flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold"
              style={{
                background: "rgba(255,255,255,0.92)",
                backdropFilter: "blur(6px)",
                color: "var(--lp-accent)",
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="18" cy="18" r="3" /><circle cx="6" cy="6" r="3" />
                <path d="M13 6h3a2 2 0 0 1 2 2v7" /><path d="M6 9v12" />
              </svg>
              {post.forks}
            </div>
          )}
        </div>

        {/* Body */}
        <div className="px-4 pt-3.5 pb-3">
          {/* Tags */}
          {tags.length > 0 && (
            <div className="flex gap-1.5 flex-wrap mb-2">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-[2px] rounded-full text-[11px] font-medium"
                  style={{ background: "var(--lp-warm-100)", color: "var(--lp-muted)" }}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Title */}
          <h3
            className="text-[15px] font-semibold leading-[1.35] mb-1"
            style={{
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {post.title}
          </h3>

          {/* Description */}
          <p
            className="text-[13px] leading-[1.5] mb-2.5"
            style={{
              color: "var(--lp-muted)",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {post.description}
          </p>

          {/* Meta */}
          <div
            className="flex items-center gap-3 pt-2.5 text-xs"
            style={{ borderTop: "1px solid var(--lp-border)", color: "var(--lp-muted)" }}
          >
            {post.recipe.cook_time_minutes > 0 && (
              <span className="flex items-center gap-1">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                {post.recipe.cook_time_minutes} 分钟
              </span>
            )}
            <span className="flex items-center gap-1">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
              简单
            </span>
          </div>
        </div>

        {/* Footer: author + actions */}
        <div
          className="flex items-center justify-between px-4 py-2.5 text-xs"
          style={{ color: "var(--lp-muted)" }}
        >
          <span className="font-medium" style={{ color: "var(--lp-fg)" }}>
            {post.author}
          </span>
          <div className="flex items-center gap-0.5">
            <button
              onClick={handleLike}
              className="flex items-center gap-1 px-1.5 py-1 rounded-md transition-colors"
              style={{ color: liked ? "#e0524a" : "var(--lp-muted)" }}
              onMouseEnter={(e) => { if (!liked) e.currentTarget.style.background = "var(--lp-warm-100)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
            >
              <Heart size={14} className={liked ? "fill-current" : ""} />
              {saves}
            </button>
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowComments(true); }}
              className="flex items-center gap-1 px-1.5 py-1 rounded-md transition-colors"
              style={{ color: "var(--lp-muted)" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--lp-warm-100)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
            >
              <MessageSquare size={14} />
              {post.comment_count ?? 0}
            </button>
          </div>
        </div>
      </Link>

      {showComments && (
        <CommentModal postId={post.id} onClose={() => setShowComments(false)} />
      )}
    </div>
  );
}
