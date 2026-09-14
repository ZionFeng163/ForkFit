"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Search, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { PostCard } from "@/components/post-card";
import { EmptyState, ErrorState, LoadingState } from "@/components/recipe-ui";
import { getFrontendAdapter } from "@/lib/frontend-adapter";
import type { RecipePost } from "@/types/forkfit";

const PAGE_SIZE = 18;
const subscribeToHydration = () => () => {};
const clientReady = () => true;
const serverReady = () => false;
const frontendAdapter = getFrontendAdapter();
const CATEGORIES = [
  { key: "推荐", zh: "推荐", en: "Recommended" },
  { key: "快手", zh: "快手", en: "Quick" },
  { key: "减脂", zh: "减脂", en: "Light" },
  { key: "家常", zh: "家常", en: "Home cooking" },
  { key: "早餐", zh: "早餐", en: "Breakfast" },
  { key: "素食", zh: "素食", en: "Vegetarian" },
  { key: "一人食", zh: "一人食", en: "Solo" },
];

type DiscoverContentProps = {
  initialPosts: RecipePost[];
  totalCount: number;
  initialOffset: number;
  initialQuery: string;
  initialCategory: string;
};

export function DiscoverContent({
  initialPosts,
  totalCount,
  initialOffset,
  initialQuery,
  initialCategory,
}: DiscoverContentProps) {
  const t = useTranslations("Home");
  const locale = useLocale();
  // Server-rendered controls must not accept edits before handlers are attached.
  const interactive = useSyncExternalStore(subscribeToHydration, clientReady, serverReady);
  const [posts, setPosts] = useState(initialPosts);
  const [total, setTotal] = useState(totalCount);
  const [nextOffset, setNextOffset] = useState(initialOffset);
  const [search, setSearch] = useState(initialQuery);
  const [category, setCategory] = useState(initialCategory);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const requestRef = useRef(0);

  const updateAddress = useCallback((q: string, nextCategory: string) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (nextCategory !== "推荐") params.set("category", nextCategory);
    const suffix = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${suffix ? `?${suffix}` : ""}`);
  }, []);

  const fetchPosts = useCallback((q: string, nextCategory: string, offset: number) => {
    const requestId = ++requestRef.current;
    setLoading(true);
    setError(null);
    return frontendAdapter.listRecipes({ limit: PAGE_SIZE, offset, query: q, category: nextCategory })
      .then(({ posts: fresh, total: freshTotal }) => {
        if (requestId !== requestRef.current) return;
        setPosts((current) => {
          if (offset === 0) return fresh;
          const seen = new Set(current.map((post) => post.id));
          return [...current, ...fresh.filter((post) => !seen.has(post.id))];
        });
        setNextOffset(offset + fresh.length);
        setTotal(freshTotal);
      })
      .catch((reason: Error) => {
        if (requestId === requestRef.current) setError(reason.message || "加载失败，请稍后重试");
      })
      .finally(() => {
        if (requestId === requestRef.current) setLoading(false);
      });
  }, []);

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    requestRef.current += 1;
  }, []);

  function changeSearch(value: string) {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      updateAddress(value.trim(), category);
      void fetchPosts(value.trim(), category, 0);
    }, 300);
  }

  function changeCategory(nextCategory: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setCategory(nextCategory);
    updateAddress(search.trim(), nextCategory);
    void fetchPosts(search.trim(), nextCategory, 0);
  }

  function resetFilters() {
    setSearch("");
    setCategory("推荐");
    updateAddress("", "推荐");
    void fetchPosts("", "推荐", 0);
  }

  const hasMore = nextOffset < total;

  return (
    <div className="pb-16">
      <div className="page-header discover-header">
        <div>
          <h1 className="page-heading">{locale === "zh" ? "发现菜谱" : "Discover recipes"}</h1>
        </div>
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-text)]" />
          <input
            className="h-11 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] pl-10 pr-10 text-sm outline-none focus:border-[var(--focus)]"
            value={search}
            disabled={!interactive}
            onChange={(event) => changeSearch(event.target.value)}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchPlaceholder")}
          />
          {(search || category !== "推荐") && (
            <button type="button" disabled={!interactive} className="absolute right-2.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-[var(--muted-text)] hover:bg-[var(--surface-container)] hover:text-[var(--text)]" onClick={resetFilters} aria-label={locale === "zh" ? "清除筛选" : "Clear filters"}>
              <X size={15} />
            </button>
          )}
        </div>
      </div>

      <div className="category-tabs" aria-label={locale === "zh" ? "菜谱分类" : "Recipe categories"}>
        {CATEGORIES.map((item) => (
          <button key={item.key} type="button" disabled={!interactive} className="category-tab" data-active={category === item.key} onClick={() => changeCategory(item.key)}>
            {locale === "zh" ? item.zh : item.en}
          </button>
        ))}
      </div>

      <section className="pt-6">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="section-heading">{search ? (locale === "zh" ? `“${search}”的搜索结果` : `Results for “${search}”`) : CATEGORIES.find((item) => item.key === category)?.[locale === "zh" ? "zh" : "en"]}</h2>
          <span className="meta-text">{total} {locale === "zh" ? "道" : "recipes"}</span>
        </div>

        {posts.length > 0 ? (
          <div className="grid gap-x-5 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((post) => <PostCard key={post.id} post={post} />)}
          </div>
        ) : loading ? <LoadingState label={locale === "zh" ? "正在找菜谱" : "Finding recipes"} />
          : error ? null
            : <EmptyState title={t("noResults")} description={locale === "zh" ? "换个关键词，或者先看看推荐分类。" : "Try another search or browse a category."} />}

        {error && <div className="mt-6"><ErrorState message={error} onRetry={() => void fetchPosts(search, category, 0)} /></div>}

        {hasMore && (
          <div className="flex justify-center pt-10">
            <button type="button" className="button-secondary min-w-32" disabled={!interactive || loading} onClick={() => void fetchPosts(search, category, nextOffset)}>
              {loading ? t("loading") : t("loadMore")}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
