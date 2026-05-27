"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/routing";
import { deletePost } from "@/lib/api";
import type { RecipePost } from "@/types/forkfit";

export function MyPostsList({ posts }: { posts: RecipePost[] }) {
  const t = useTranslations("MyPosts");
  const [items, setItems] = useState(posts);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function handleDelete(postId: string) {
    if (!window.confirm(t("deleteConfirm"))) return;
    setDeleting(postId);
    try {
      await deletePost(postId);
      setItems((prev) => prev.filter((p) => p.id !== postId));
    } finally {
      setDeleting(null);
    }
  }

  if (items.length === 0) {
    return <p className="text-sm text-[#9f9890]">{t("empty")}</p>;
  }

  return (
    <div className="space-y-3">
      {items.map((post) => (
        <div
          key={post.id}
          className="flex items-center gap-4 rounded-lg border border-[#e7e2db] bg-white px-4 py-3"
        >
          {post.image_urls && post.image_urls.length > 0 ? (
            <img
              src={post.image_urls[0]}
              alt={post.title}
              className="h-16 w-16 shrink-0 rounded-md object-cover"
            />
          ) : (
            <div className="h-16 w-16 shrink-0 rounded-md bg-[#f5f0ea]" />
          )}
          <div className="min-w-0 flex-1">
            <Link
              href={`/packs/${post.id}`}
              className="text-sm font-medium hover:underline"
            >
              {post.title}
            </Link>
            {post.created_at ? (
              <p className="mt-0.5 text-xs text-[#9f9890]">
                {t("createdAt")}: {new Date(post.created_at).toLocaleDateString()}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href={`/packs/${post.id}/edit`}
              className="inline-flex items-center rounded-md border border-[#e7e2db] px-3 py-1.5 text-xs text-[#5f5a52] hover:bg-[#f9f6f2]"
            >
              {t("edit")}
            </Link>
            <button
              onClick={() => handleDelete(post.id)}
              disabled={deleting === post.id}
              className="inline-flex items-center rounded-md border border-[#e8a9a0] px-3 py-1.5 text-xs text-[#9e3a2b] hover:bg-[#fdf0ee] disabled:opacity-50"
            >
              {deleting === post.id ? "..." : t("delete")}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
