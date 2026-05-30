"use client";

import { useEffect, useState } from "react";
import { GitFork, Heart, Bookmark } from "lucide-react";

import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/routing";
import { getPost, toggleLike, toggleSave } from "@/lib/api";
import type { RecipePost } from "@/types/forkfit";

type Props = {
  post: RecipePost;
  hasTheme: boolean;
  forkLabel: string;
  forkDescription: string;
  authorLabel: string;
  themeLabel: string;
  forksLabel: string;
  startForkLabel: string;
  editLabel: string;
};

export function PostSidebar({
  post,
  hasTheme,
  forkLabel,
  forkDescription,
  authorLabel,
  themeLabel,
  forksLabel,
  startForkLabel,
  editLabel,
}: Props) {
  const { user } = useAuth();
  const [liked, setLiked] = useState(post.liked ?? false);
  const [saves, setSaves] = useState(post.saves);
  const [saved, setSaved] = useState(post.saved ?? false);
  const [canEdit, setCanEdit] = useState(user?.id === post.user_id);

  useEffect(() => {
    getPost(post.id).then((fresh) => {
      setLiked(fresh.liked ?? false);
      setSaves(fresh.saves);
      setSaved(fresh.saved ?? false);
    });
  }, [post.id]);

  useEffect(() => {
    setCanEdit(user?.id === post.user_id);
  }, [user, post.user_id]);

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
    });
  }

  return (
    <aside className="h-fit rounded-lg border border-[#e4ded6] bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{forkLabel}</h2>
          <p className="mt-1 text-sm leading-6 text-[#625b52]">{forkDescription}</p>
        </div>
        <GitFork size={20} />
      </div>

      <div className="mt-4 flex items-center gap-4">
        <button
          onClick={handleLike}
          className="flex items-center gap-1.5 text-sm text-[#6f6a61] transition-colors hover:text-[#c0524a]"
        >
          <Heart size={18} className={liked ? "fill-[#c0524a] text-[#c0524a]" : ""} />
          {saves}
        </button>
        <button
          onClick={handleSave}
          className="text-sm text-[#6f6a61] transition-colors hover:text-[#7b6f61]"
        >
          <Bookmark size={18} className={saved ? "fill-[#7b6f61] text-[#7b6f61]" : ""} />
        </button>
      </div>

      <dl className="mt-4 space-y-3 border-y border-[#eee8df] py-4 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-[#6f6a61]">{authorLabel}</dt>
          <dd>
            <Link href={`/users/${post.user_id}`} className="hover:underline">
              {post.author}
            </Link>
          </dd>
        </div>
        {hasTheme ? (
          <div className="flex justify-between gap-4">
            <dt className="text-[#6f6a61]">{themeLabel}</dt>
            <dd>{post.theme}</dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-4">
          <dt className="text-[#6f6a61]">{forksLabel}</dt>
          <dd>{post.forks}</dd>
        </div>
      </dl>

      <Button asChild className="mt-5 w-full">
        <Link href={`/packs/${post.id}/fork`}>{startForkLabel}</Link>
      </Button>

      {canEdit ? (
        <Link
          href={`/packs/${post.id}/edit`}
          className="mt-3 flex h-10 items-center justify-center rounded-md border border-[#d8d0c6] bg-white px-4 text-sm font-medium text-[#625b52] hover:text-[#1f1f1f]"
        >
          {editLabel}
        </Link>
      ) : null}
    </aside>
  );
}
