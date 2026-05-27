"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { PostGrid } from "@/components/post-grid";
import { Button } from "@/components/ui/button";
import { listPosts } from "@/lib/api";
import type { RecipePost } from "@/types/forkfit";

const PAGE_SIZE = 20;

export function PostGridPaginated({
  initialPosts,
  totalCount,
}: {
  initialPosts: RecipePost[];
  totalCount: number;
}) {
  const t = useTranslations("Home");
  const [posts, setPosts] = useState(initialPosts);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(totalCount > PAGE_SIZE);

  async function loadMore() {
    setLoading(true);
    try {
      const nextPosts = await listPosts(PAGE_SIZE, posts.length);
      setPosts((prev) => [...prev, ...nextPosts]);
      if (posts.length + nextPosts.length >= totalCount) {
        setHasMore(false);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <PostGrid posts={posts} />
      {hasMore ? (
        <div className="mt-6 flex justify-center">
          <Button
            variant="outline"
            onClick={loadMore}
            disabled={loading}
          >
            {loading ? t("loading") : t("loadMore")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
