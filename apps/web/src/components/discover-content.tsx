"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Clock3, Search, SlidersHorizontal, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { PostCard } from "@/components/post-card";
import { RemoteImage } from "@/components/remote-image";
import { Link } from "@/i18n/routing";
import { listPostsPage } from "@/lib/api";
import type { RecipePost } from "@/types/forkfit";

const PAGE_SIZE = 18;
const CATEGORIES = [
  { key: "推荐", zh: "推荐", en: "Recommended" },
  { key: "快手", zh: "快手", en: "Quick" },
  { key: "减脂", zh: "减脂", en: "Light" },
  { key: "家常", zh: "家常", en: "Home cooking" },
  { key: "早餐", zh: "早餐", en: "Breakfast" },
  { key: "素食", zh: "素食", en: "Vegetarian" },
  { key: "低预算", zh: "低预算", en: "Budget" },
];

type DiscoverContentProps = {
  initialPosts: RecipePost[];
  totalCount: number;
  initialOffset: number;
  featuredPost: RecipePost | null;
  initialQuery: string;
  initialCategory: string;
};

export function DiscoverContent({
  initialPosts,
  totalCount,
  initialOffset,
  featuredPost,
  initialQuery,
  initialCategory,
}: DiscoverContentProps) {
  const t = useTranslations("Home");
  const locale = useLocale();
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
    return listPostsPage(PAGE_SIZE, offset, q, "", nextCategory)
      .then(({ posts: fresh, total: freshTotal }) => {
        if (requestId !== requestRef.current) return;
        const filtered = fresh.filter((post) => post.id !== featuredPost?.id);
        setPosts((current) => {
          if (offset === 0) return filtered;
          const seen = new Set(current.map((post) => post.id));
          return [...current, ...filtered.filter((post) => !seen.has(post.id))];
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
  }, [featuredPost?.id]);

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

  const showFeatured = Boolean(featuredPost && !search && category === "推荐");
  const hasMore = nextOffset < total;

  return (
    <div className="pb-16 pt-8 md:pt-10">
      <div className="grid items-end gap-5 border-b border-[var(--line)] pb-6 md:grid-cols-[1fr_360px]">
        <div>
          <h1 className="page-heading">{locale === "zh" ? "发现菜谱" : "Discover recipes"}</h1>
          <p className="mt-2 text-[15px] text-[var(--muted-text)]">{t("discoverSubtitle")}</p>
        </div>
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-text)]" />
          <input
            className="h-11 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] pl-10 pr-10 text-sm outline-none focus:border-[var(--focus)]"
            value={search}
            onChange={(event) => changeSearch(event.target.value)}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchPlaceholder")}
          />
          {(search || category !== "推荐") && (
            <button type="button" className="absolute right-2.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-[var(--muted-text)] hover:bg-[var(--muted)]" onClick={resetFilters} aria-label={locale === "zh" ? "清除筛选" : "Clear filters"}>
              <X size={15} />
            </button>
          )}
        </div>
      </div>

      <div className="category-tabs" aria-label={locale === "zh" ? "菜谱分类" : "Recipe categories"}>
        {CATEGORIES.map((item) => (
          <button key={item.key} type="button" className="category-tab" data-active={category === item.key} onClick={() => changeCategory(item.key)}>
            {locale === "zh" ? item.zh : item.en}
          </button>
        ))}
      </div>

      {showFeatured && featuredPost && (
        <section className="py-7">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="section-heading">{locale === "zh" ? "编辑推荐" : "Editor’s pick"}</h2>
            <span className="meta-text">{featuredPost.author}</span>
          </div>
          <article className="grid overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--surface)] md:h-[340px] md:grid-cols-[1.2fr_0.8fr]">
            <Link href={`/packs/${featuredPost.id}`} className="h-[200px] overflow-hidden md:h-full">
              <RemoteImage src={featuredPost.image_urls[0] ?? ""} alt={featuredPost.title} className="h-full w-full object-cover" priority />
            </Link>
            <div className="flex flex-col justify-center p-5 md:p-8">
              <span className="recipe-label">{featuredPost.recipe.tags[0] || (locale === "zh" ? "今日推荐" : "Recommended")}</span>
              <h3 className="mt-3 text-2xl font-bold leading-tight tracking-[-0.03em] md:text-3xl">
                <Link href={`/packs/${featuredPost.id}`} className="hover:text-[var(--brand-hover)]">{featuredPost.title}</Link>
              </h3>
              <p className="mt-4 hidden line-clamp-3 leading-7 text-[var(--muted-text)] sm:block">{featuredPost.description}</p>
              <div className="mt-6 flex items-center gap-4 border-t border-[var(--line)] pt-4 text-sm text-[var(--muted-text)]">
                <span className="flex items-center gap-1.5"><Clock3 size={15} />{featuredPost.recipe.cook_time_minutes} {locale === "zh" ? "分钟" : "min"}</span>
                <span>{featuredPost.forks} {locale === "zh" ? "次定制" : "forks"}</span>
              </div>
              <Link href={`/packs/${featuredPost.id}/fork`} className="button-primary mt-5 w-fit"><SlidersHorizontal size={16} />{locale === "zh" ? "按我的需求调整" : "Adapt this recipe"}</Link>
            </div>
          </article>
        </section>
      )}

      <section className={showFeatured ? "pt-2" : "pt-8"}>
        <div className="mb-5 flex items-center justify-between border-b border-[var(--line)] pb-4">
          <h2 className="section-heading">{search ? (locale === "zh" ? `“${search}”的搜索结果` : `Results for “${search}”`) : CATEGORIES.find((item) => item.key === category)?.[locale === "zh" ? "zh" : "en"]}</h2>
          <span className="meta-text">{total} {locale === "zh" ? "道" : "recipes"}</span>
        </div>

        {posts.length > 0 ? (
          <div className="grid gap-x-5 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((post) => <PostCard key={post.id} post={post} />)}
          </div>
        ) : !loading && !error ? (
          <div className="py-20 text-center text-[var(--muted-text)]">{t("noResults")}</div>
        ) : null}

        {error && <div className="status-panel mt-6 border-[var(--danger)] text-sm text-[var(--danger)]">{error}</div>}

        {hasMore && (
          <div className="flex justify-center pt-10">
            <button type="button" className="button-secondary min-w-32" disabled={loading} onClick={() => void fetchPosts(search, category, nextOffset)}>
              {loading ? t("loading") : t("loadMore")}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
