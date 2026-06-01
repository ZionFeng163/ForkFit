"use client";

import { useEffect, useState } from "react";
import { Clock, DollarSign, GitFork, Heart, Bookmark, MessageSquare } from "lucide-react";

import { RemoteImage } from "@/components/remote-image";
import { Link } from "@/i18n/routing";
import { useAuth } from "@/components/auth-provider";
import { toggleLike, toggleSave } from "@/lib/api";
import { CommentModal } from "@/components/comment-modal";
import type { RecipePost } from "@/types/forkfit";

export function PostCard({ post }: { post: RecipePost }) {
  const tags = post.recipe.tags.slice(0, 3);
  const showMeta = isMeaningfulRecipe(post);
  const { user } = useAuth();
  const [liked, setLiked] = useState(post.liked ?? false);
  const [saves, setSaves] = useState(post.saves);
  const [saved, setSaved] = useState(post.saved ?? false);
  const [showComments, setShowComments] = useState(false);

  useEffect(() => {
    setLiked(post.liked ?? false);
    setSaves(post.saves);
    setSaved(post.saved ?? false);
  }, [post.liked, post.saves, post.saved]);

  function handleLike(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!user) return;
    toggleLike(post.id).then((res) => {
      setLiked(res.liked);
      setSaves(res.saves);
    });
  }

  function handleSave(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!user) return;
    toggleSave(post.id).then((res) => {
      setSaved(res.saved);
    });
  }

  const hasImage = post.image_urls.length > 0;

  return (
    <div className="mb-4 overflow-hidden rounded-lg border border-[#e4ded6] bg-white transition-colors hover:border-[#cfc5b8]">
      <Link href={`/packs/${post.id}`} className="block">
        {hasImage && (
          <div className="relative aspect-[4/5] bg-[#eee9e2]">
            <RemoteImage
              src={post.image_urls[0]}
              alt={post.title}
              className="h-full w-full object-cover"
            />
          </div>
        )}
        <div className={`space-y-3 ${hasImage ? "p-3" : "p-4"}`}>
          <div>
            <h2 className={`${hasImage ? "line-clamp-2 text-[15px] font-semibold leading-5" : "text-base font-semibold"}`}>
              {post.title}
            </h2>
            <p className={`${hasImage ? "mt-1 line-clamp-2 text-[13px] leading-5 text-[#6f6a61]" : "mt-1 text-sm text-[#6f6a61]"}`}>
              {post.description}
            </p>
          </div>
          {tags.length ? (
            <div className="flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-md border border-[#e5ded5] px-1.5 py-0.5 text-[12px] text-[#625b52]"
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
          {showMeta ? (
            <div className="grid grid-cols-3 gap-2 border-t border-[#eee8df] pt-3 text-[12px] text-[#625b52]">
              <span className="flex items-center gap-1">
                <Clock size={14} />
                {post.recipe.cook_time_minutes}m
              </span>
              <span className="flex items-center gap-1">
                <DollarSign size={14} />
                {post.recipe.estimated_cost.toFixed(0)}
              </span>
              <span className="flex items-center gap-1">
                <GitFork size={14} />
                {post.forks}
              </span>
            </div>
          ) : null}
        </div>
      </Link>
      <div className="flex items-center justify-between border-t border-[#eee8df] px-3 py-2.5 text-[13px] text-[#6f6a61]">
        <div className="flex items-center gap-2">
          <Link href={`/users/${post.user_id}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>
            {post.author}
          </Link>
          {post.created_at ? <span className="text-[#9f9890]">· {timeAgo(post.created_at)}</span> : null}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={handleLike} className="flex items-center gap-1 rounded p-1 transition-colors hover:bg-[#fdf0ee] hover:text-[#c0524a]">
            <Heart size={16} className={liked ? "fill-[#c0524a] text-[#c0524a]" : ""} />
            {saves}
          </button>
          <button onClick={handleSave} className="flex items-center gap-1 rounded p-1 transition-colors hover:bg-[#f5f0ea] hover:text-[#7b6f61]">
            <Bookmark size={16} className={saved ? "fill-[#7b6f61] text-[#7b6f61]" : ""} />
          </button>
          <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowComments(true); }} className="flex items-center gap-1 rounded p-1 transition-colors hover:bg-[#f0ebe4] hover:text-[#5f5a52]">
            <MessageSquare size={16} />
            {post.comment_count ?? 0}
          </button>
        </div>
      </div>
      {showComments ? (
        <CommentModal postId={post.id} onClose={() => setShowComments(false)} />
      ) : null}
    </div>
  );
}

function isMeaningfulRecipe(post: RecipePost) {
  const recipe = post.recipe;
  const hasRealIngredients = !(
    recipe.ingredients.length === 1 && recipe.ingredients[0] === post.title
  );
  return (
    hasRealIngredients ||
    recipe.equipment.length > 0 ||
    recipe.tags.length > 0 ||
    Boolean(recipe.notes) ||
    recipe.cook_time_minutes !== 30 ||
    recipe.estimated_cost !== 10
  );
}

function timeAgo(dateStr: string) {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const seconds = Math.floor((now - then) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  return `${Math.floor(months / 12)}y`;
}
