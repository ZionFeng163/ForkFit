"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Search, X } from "lucide-react";

import { PostCard } from "@/components/post-card";
import { RemoteImage } from "@/components/remote-image";
import { Link } from "@/i18n/routing";
import { listPostsPage } from "@/lib/api";
import type { RecipePost } from "@/types/forkfit";

const PAGE_SIZE = 20;

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
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}天前`;
  const months = Math.floor(days / 30);
  return `${months}个月前`;
}

const CATEGORIES = [
  { key: "all", label: { zh: "全部", en: "All" } },
  { key: "家常菜", label: { zh: "家常菜", en: "Home cooking" } },
  { key: "快手菜", label: { zh: "快手菜", en: "Quick meals" } },
  { key: "减脂餐", label: { zh: "减脂餐", en: "Low-cal" } },
  { key: "早餐", label: { zh: "早餐", en: "Breakfast" } },
  { key: "面食", label: { zh: "面食", en: "Noodles" } },
  { key: "甜品", label: { zh: "甜品", en: "Desserts" } },
  { key: "汤羹", label: { zh: "汤羹", en: "Soups" } },
  { key: "便当", label: { zh: "便当", en: "Bento" } },
];

interface DiscoverContentProps {
  initialPosts: RecipePost[];
  totalCount: number;
  initialOffset: number;
  featuredPost: RecipePost | null;
}

export function DiscoverContent({ initialPosts, totalCount, initialOffset, featuredPost }: DiscoverContentProps) {
  const t = useTranslations("Home");
  const locale = useLocale();
  const [posts, setPosts] = useState(initialPosts);
  const [loading, setLoading] = useState(false);
  const [totalCount_, setTotalCount] = useState(totalCount);
  const [nextOffset, setNextOffset] = useState(initialOffset);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [fetchError, setFetchError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const requestIdRef = useRef(0);

  const fetchPosts = useCallback((q: string, tag: string, offset: number) => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setFetchError(null);
    const apiTag = tag === "all" ? "" : tag;
    listPostsPage(PAGE_SIZE, offset, q, apiTag)
      .then(({ posts: fresh, total }) => {
        if (requestId !== requestIdRef.current) return;
        const withoutFeatured = fresh.filter((post) => post.id !== featuredPost?.id);
        if (offset === 0) {
          const seen = new Set<string>();
          setPosts(withoutFeatured.filter((post) => {
            if (seen.has(post.id)) return false;
            seen.add(post.id);
            return true;
          }));
        } else {
          setPosts((prev) => {
            const seen = new Set(prev.map((p) => p.id));
            return [...prev, ...withoutFeatured.filter((post) => {
              if (seen.has(post.id)) return false;
              seen.add(post.id);
              return true;
            })];
          });
        }
        setNextOffset(offset + fresh.length);
        setTotalCount(total);
      })
      .catch((e) => {
        if (requestId !== requestIdRef.current) return;
        setFetchError(e.message || "加载失败，请稍后重试");
      })
      .finally(() => {
        if (requestId === requestIdRef.current) setLoading(false);
      });
  }, [featuredPost?.id]);

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    requestIdRef.current += 1;
  }, []);

  function handleSearch(value: string) {
    setSearch(value);
    requestIdRef.current += 1;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchPosts(value, activeCategory, 0);
    }, 300);
  }

  function handleCategoryClick(catKey: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const next = activeCategory === catKey ? "all" : catKey;
    setActiveCategory(next);
    fetchPosts(search, next, 0);
  }

  function clearSearch() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSearch("");
    setActiveCategory("all");
    fetchPosts("", "all", 0);
  }

  const hasMore = nextOffset < totalCount_;

  function loadMore() {
    fetchPosts(search, activeCategory, nextOffset);
  }

  const showClear = search || activeCategory !== "all";

  return (
    <div>
      {/* Welcome + Search */}
      <div className="flex items-start justify-between gap-6 flex-wrap pt-8">
        <div>
          <h1
            className="text-[26px] font-bold tracking-[-0.02em] mb-1"
            style={{ color: "var(--lp-fg)" }}
          >
            {t("discoverTitle")}<span style={{ color: "var(--lp-accent)" }}>{t("discoverTitleHighlight")}</span>
          </h1>
          <p className="text-sm" style={{ color: "var(--lp-muted)" }}>
            {t("discoverSubtitle")}
          </p>
        </div>
        <div className="relative w-[320px] flex-shrink-0 max-md:w-full">
          <Search
            size={16}
            className="absolute left-3.5 top-1/2 -translate-y-1/2"
            style={{ color: "var(--lp-muted)" }}
          />
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="discover-search h-[42px] w-full rounded-xl pl-10 pr-9 text-sm outline-none transition-all duration-200"
          />
          {showClear && (
            <button
              onClick={clearSearch}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 transition-colors"
              style={{ color: "var(--lp-muted)" }}
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Category pills */}
      <div className="flex gap-2 pt-5 flex-wrap">
        {CATEGORIES.map((cat) => {
          const active = activeCategory === cat.key;
          const label = locale === "en" ? cat.label.en : cat.label.zh;
          return (
            <button
              key={cat.key}
              onClick={() => handleCategoryClick(cat.key)}
              className="inline-flex items-center gap-1.5 rounded-full px-4 py-[7px] text-[13px] font-medium transition-all duration-200"
              style={{
                background: active ? "var(--lp-fg)" : "var(--lp-surface)",
                color: active ? "var(--lp-surface)" : "var(--lp-muted)",
                border: `1px solid ${active ? "var(--lp-fg)" : "var(--lp-border)"}`,
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Featured recipe */}
      {featuredPost && (
        <>
          <div className="flex items-center justify-between pt-7 pb-4">
            <h2 className="text-lg font-bold" style={{ letterSpacing: "-0.01em" }}>
              {locale === "en" ? "Today's pick" : "今日推荐"}
            </h2>
            <Link href={`/packs/${featuredPost.id}`} className="text-[13px] font-medium" style={{ color: "var(--lp-accent)" }}>
              {locale === "en" ? "View more" : "查看更多"}
            </Link>
          </div>
          <Link href={`/packs/${featuredPost.id}`}>
            <div
              className="grid overflow-hidden cursor-pointer transition-shadow duration-250 hover:shadow-[0_8px_32px_rgba(26,23,20,0.08)]"
              style={{
                gridTemplateColumns: "1.1fr 1fr",
                background: "var(--lp-surface)",
                borderRadius: "var(--radius, 12px)",
                border: "1px solid var(--lp-border)",
              }}
            >
              {/* Featured image */}
              <div
                className="relative grid place-items-center overflow-hidden"
                style={{ aspectRatio: "16/10" }}
              >
                {featuredPost.image_urls.length > 0 ? (
                  <RemoteImage
                    src={featuredPost.image_urls[0]}
                    alt={featuredPost.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div
                    className="w-full h-full grid place-items-center"
                    style={{ background: getGradient(featuredPost.id) }}
                  >
                    <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="rgba(232,93,58,0.35)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2C6.48 2 2 6 2 10c0 2.5 1.5 5 4 6.5V22l4-2.5c.6.2 1.3.5 2 .5 5.52 0 10-4 10-8s-4.48-8-10-8z" />
                    </svg>
                  </div>
                )}
                <div
                  className="absolute top-4 left-4 text-white text-[11px] font-bold px-3 py-1 rounded-full"
                  style={{ background: "var(--lp-accent)", letterSpacing: "0.04em" }}
                >
                  {locale === "en" ? "Popular" : "人气推荐"}
                </div>
              </div>
              {/* Featured body */}
              <div className="flex flex-col justify-center px-8 py-7">
                <div className="flex gap-1.5 flex-wrap mb-3">
                  {featuredPost.recipe.tags.slice(0, 2).map((tag) => (
                    <span
                      key={tag}
                      className="px-2.5 py-[3px] rounded-full text-[11px] font-semibold"
                      style={{ background: "var(--lp-accent-light)", color: "var(--lp-accent)" }}
                    >
                      {tag}
                    </span>
                  ))}
                  {featuredPost.recipe.cook_time_minutes > 0 && (
                    <span
                      className="px-2.5 py-[3px] rounded-full text-[11px] font-semibold"
                      style={{ background: "var(--lp-green-light)", color: "var(--lp-green)" }}
                    >
                      {featuredPost.recipe.cook_time_minutes} {locale === "en" ? "min" : "分钟"}
                    </span>
                  )}
                </div>
                <h3 className="text-[22px] font-bold leading-[1.3] mb-2" style={{ letterSpacing: "-0.01em" }}>
                  {featuredPost.title}
                </h3>
                <p className="text-sm leading-[1.6] mb-4" style={{ color: "var(--lp-muted)" }}>
                  {featuredPost.description}
                </p>
                <div className="flex items-center gap-4 text-[13px]" style={{ color: "var(--lp-muted)" }}>
                  {featuredPost.recipe.cook_time_minutes > 0 && (
                    <span className="flex items-center gap-1.5">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                      {featuredPost.recipe.cook_time_minutes} {locale === "en" ? "min" : "分钟"}
                    </span>
                  )}
                  <span className="flex items-center gap-1.5">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="18" cy="18" r="3" /><circle cx="6" cy="6" r="3" /><path d="M13 6h3a2 2 0 0 1 2 2v7" /><path d="M6 9v12" /></svg>
                    {featuredPost.forks} {locale === "en" ? "forks" : "次复刻"}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-4 pt-4" style={{ borderTop: "1px solid var(--lp-border)" }}>
                  <div
                    className="w-7 h-7 rounded-full grid place-items-center text-[11px] font-bold"
                    style={{ background: "var(--lp-warm-100)", color: "var(--lp-muted)" }}
                  >
                    {featuredPost.author?.[0] || "?"}
                  </div>
                  <span className="text-[13px] font-medium">{featuredPost.author}</span>
                  {featuredPost.created_at && (
                    <span className="text-xs" style={{ color: "var(--lp-muted)" }}>
                      · {timeAgo(featuredPost.created_at)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </Link>
        </>
      )}

      {/* Recipe grid section header */}
      <div className="flex items-center justify-between pt-7 pb-4">
        <h2 className="text-lg font-bold" style={{ letterSpacing: "-0.01em" }}>
          {activeCategory === "all" ? (locale === "en" ? "All recipes" : "全部菜谱") : (locale === "en" ? activeCategory : activeCategory)}
        </h2>
        <span className="text-[13px]" style={{ color: "var(--lp-muted)" }}>
          {totalCount_} {locale === "en" ? "recipes" : "道"}
        </span>
      </div>

      {/* Recipe grid */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {posts.map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
      </div>

      {fetchError && (
        <div className="my-4 px-4 py-3 rounded-xl text-[13px]" style={{ background: "#fef0ef", color: "#7f3525" }}>
          {fetchError}
        </div>
      )}

      {posts.length === 0 && !loading && !fetchError ? (
        <p className="py-12 text-center text-sm" style={{ color: "var(--lp-muted)" }}>
          {t("noResults")}
        </p>
      ) : null}

      {/* Load more */}
      {hasMore ? (
        <div className="flex justify-center py-8">
          <button
            onClick={loadMore}
            disabled={loading}
            className="px-8 py-2.5 rounded-full text-sm font-medium transition-all duration-200"
            style={{
              border: "1px solid var(--lp-border)",
              background: "var(--lp-surface)",
              color: loading ? "var(--lp-muted)" : "var(--lp-fg-secondary, var(--lp-muted))",
              cursor: loading ? "not-allowed" : "pointer",
            }}
            onMouseEnter={(e) => {
              if (!loading) {
                e.currentTarget.style.borderColor = "var(--lp-accent)";
                e.currentTarget.style.color = "var(--lp-accent)";
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--lp-border)";
              e.currentTarget.style.color = "var(--lp-fg-secondary, var(--lp-muted))";
            }}
          >
            {loading ? t("loading") : t("loadMore")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
