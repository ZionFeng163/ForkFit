"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Search, X } from "lucide-react";

import { PostGrid } from "@/components/post-grid";
import { Button } from "@/components/ui/button";
import { listPosts, listTags } from "@/lib/api";
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
  const [totalCount_, setTotalCount] = useState(totalCount);
  const [search, setSearch] = useState("");
  const [activeTag, setActiveTag] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listTags().then(setTags);
  }, []);

  const fetchPosts = useCallback((q: string, tag: string, offset: number) => {
    setLoading(true);
    listPosts(PAGE_SIZE, offset, q, tag)
      .then((fresh) => {
        if (offset === 0) {
          setPosts(fresh);
        } else {
          setPosts((prev) => [...prev, ...fresh]);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    listPosts(PAGE_SIZE, 0).then((fresh) => {
      setPosts(fresh);
    });
  }, []);

  function handleSearch(value: string) {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchPosts(value, activeTag, 0);
    }, 300);
  }

  function handleTagClick(tag: string) {
    const next = activeTag === tag ? "" : tag;
    setActiveTag(next);
    fetchPosts(search, next, 0);
  }

  function clearSearch() {
    setSearch("");
    setActiveTag("");
    fetchPosts("", "", 0);
    inputRef.current?.focus();
  }

  const hasMore = posts.length < totalCount_;

  async function loadMore() {
    setLoading(true);
    try {
      const nextPosts = await listPosts(PAGE_SIZE, posts.length, search, activeTag);
      setPosts((prev) => [...prev, ...nextPosts]);
      if (posts.length + nextPosts.length >= totalCount_) {
        // no more
      }
    } finally {
      setLoading(false);
    }
  }

  const showClear = search || activeTag;

  return (
    <div>
      {/* Search bar */}
      <div className="mb-4 flex items-center gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9f9890]" />
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="h-10 w-full rounded-lg border border-[#e4ded6] bg-white pl-9 pr-3 text-sm outline-none transition-colors focus:border-[#7b6f61]"
          />
          {showClear ? (
            <button
              onClick={clearSearch}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-[#9f9890] hover:text-[#5f5a52]"
            >
              <X size={14} />
            </button>
          ) : null}
        </div>
      </div>

      {/* Tag chips */}
      {tags.length > 0 ? (
        <div className="mb-4 flex flex-wrap gap-2">
          {tags.slice(0, 20).map((tag) => (
            <button
              key={tag}
              onClick={() => handleTagClick(tag)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                activeTag === tag
                  ? "border-[#7b6f61] bg-[#f5f0ea] font-medium text-[#2f2a24]"
                  : "border-[#e4ded6] bg-white text-[#6f6a61] hover:border-[#cfc5b8]"
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      ) : null}

      <PostGrid posts={posts} />

      {posts.length === 0 && !loading ? (
        <p className="py-12 text-center text-sm text-[#9f9890]">{t("noResults")}</p>
      ) : null}

      {hasMore ? (
        <div className="mt-6 flex justify-center">
          <Button variant="outline" onClick={loadMore} disabled={loading}>
            {loading ? t("loading") : t("loadMore")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
