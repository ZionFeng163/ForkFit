import { ArrowRight, Clock3, SlidersHorizontal } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { BrandLogo } from "@/components/brand-logo";
import { PostCard } from "@/components/post-card";
import { RemoteImage } from "@/components/remote-image";
import { Link } from "@/i18n/routing";
import type { RecipePost } from "@/types/forkfit";

const API_BASE = process.env.FORKFIT_API_BASE_URL ?? "http://127.0.0.1:8000";

async function loadPosts(category: string, limit: number) {
  const params = new URLSearchParams({ category, limit: String(limit), offset: "0" });
  try {
    const response = await fetch(`${API_BASE}/posts?${params}`, { cache: "no-store" });
    if (!response.ok) return [];
    return await response.json() as RecipePost[];
  } catch {
    return [];
  }
}

type HomeProps = { params: Promise<{ locale: string }> };

export default async function Home({ params }: HomeProps) {
  const { locale } = await params;
  const isZh = locale === "zh";
  const [recommended, quick, homeCooking, vegetarian] = await Promise.all([
    loadPosts("推荐", 9),
    loadPosts("快手", 6),
    loadPosts("家常", 6),
    loadPosts("素食", 6),
  ]);
  const featured = recommended[0] ?? homeCooking[0] ?? quick[0] ?? null;

  return (
    <AppShell>
      <div className="site-container pb-16">
        <section className="border-b border-[var(--line)] py-8 md:py-12">
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <h1 className="page-heading">{isZh ? "今天，认真吃顿饭" : "Make something worth eating"}</h1>
              <p className="mt-2 max-w-xl text-[15px] text-[var(--muted-text)]">
                {isZh ? "从可靠菜谱开始，再按你的时间、口味和饮食限制调整。" : "Start with a reliable recipe, then adapt it to your time, taste, and needs."}
              </p>
            </div>
            <Link href="/discover" className="button-secondary desktop-only">
              {isZh ? "浏览全部菜谱" : "Browse all"}<ArrowRight size={16} />
            </Link>
          </div>

          {featured ? (
            <div>
              <article className="grid overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--surface)] md:h-[410px] md:grid-cols-[1.15fr_0.85fr]">
                <Link href={`/packs/${featured.id}`} className="h-[240px] overflow-hidden md:h-full">
                  <RemoteImage src={featured.image_urls[0] ?? ""} alt={featured.title} className="h-full w-full object-cover" priority />
                </Link>
                <div className="flex flex-col justify-between p-5 md:p-8 lg:p-10">
                  <div>
                    <span className="recipe-label">{isZh ? "今日推荐" : "Today’s pick"}</span>
                    <h2 className="mt-3 text-[clamp(25px,3vw,38px)] font-bold leading-[1.22] tracking-[-0.035em]">
                      <Link href={`/packs/${featured.id}`} className="hover:text-[var(--brand-hover)]">{featured.title}</Link>
                    </h2>
                    <p className="mt-4 line-clamp-3 text-[15px] leading-7 text-[var(--muted-text)]">{featured.description}</p>
                  </div>
                  <div className="mt-8">
                    <div className="mb-5 flex items-center gap-4 border-t border-[var(--line)] pt-4 text-sm text-[var(--muted-text)]">
                      {featured.recipe.cook_time_minutes > 0 && <span className="flex items-center gap-1.5"><Clock3 size={15} />{featured.recipe.cook_time_minutes} {isZh ? "分钟" : "min"}</span>}
                      <span>{featured.author}</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Link href={`/packs/${featured.id}`} className="button-primary">{isZh ? "查看菜谱" : "View recipe"}</Link>
                      <Link href={`/packs/${featured.id}/fork`} className="button-secondary"><SlidersHorizontal size={16} />{isZh ? "按我的需求调整" : "Adapt it"}</Link>
                    </div>
                  </div>
                </div>
              </article>
            </div>
          ) : (
            <div className="status-panel py-16 text-center text-[var(--muted-text)]">{isZh ? "暂时没有可展示的菜谱" : "No recipes available"}</div>
          )}
        </section>

        <HomeSection title={isZh ? "30 分钟内" : "Under 30 minutes"} description={isZh ? "工作日也能从容完成" : "Made for busy weekdays"} posts={quick} href="/discover?category=快手" />
        <HomeSection title={isZh ? "家常菜" : "Home cooking"} description={isZh ? "会反复做的日常味道" : "Recipes worth repeating"} posts={homeCooking} href="/discover?category=家常" />
        <HomeSection title={isZh ? "素食灵感" : "Vegetarian ideas"} description={isZh ? "让蔬菜成为一顿完整的饭" : "Vegetables as a complete meal"} posts={vegetarian} href="/discover?category=素食" />

        <section className="mt-12 grid gap-8 border-y border-[var(--line)] py-9 md:grid-cols-[0.8fr_2fr]">
          <div>
            <h2 className="section-heading">{isZh ? "一份菜谱，做成你的版本" : "One recipe, made yours"}</h2>
          </div>
          <ol className="grid gap-6 sm:grid-cols-3">
            {[isZh ? "选一道想做的菜" : "Choose a recipe", isZh ? "写下你的限制" : "Add your constraints", isZh ? "得到可直接照做的版本" : "Cook your adapted version"].map((step, index) => (
              <li key={step} className="border-l border-[var(--line)] pl-4">
                <span className="text-xs font-semibold text-[var(--brand)]">0{index + 1}</span>
                <p className="mt-2 font-semibold">{step}</p>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <footer className="border-t border-[var(--line)] bg-[var(--surface)] py-7">
        <div className="site-container flex flex-wrap items-center justify-between gap-4">
          <BrandLogo linked={false} />
          <p className="text-xs text-[var(--muted-text)]">© 2026 {isZh ? "吃什么 · 让菜谱真正适合你" : "ForkFit · Recipes that fit"}</p>
        </div>
      </footer>
    </AppShell>
  );
}

function HomeSection({ title, description, posts, href }: { title: string; description: string; posts: RecipePost[]; href: string }) {
  if (posts.length === 0) return null;
  return (
    <section className="pt-10">
      <div className="mb-5 flex items-end justify-between gap-4 border-b border-[var(--line)] pb-4">
        <div>
          <h2 className="section-heading">{title}</h2>
          <p className="mt-1 text-sm text-[var(--muted-text)]">{description}</p>
        </div>
        <Link href={href} className="text-sm font-semibold text-[var(--brand-hover)]">查看全部</Link>
      </div>
      <div className="grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
        {posts.slice(0, 6).map((post) => <PostCard key={post.id} post={post} />)}
      </div>
    </section>
  );
}
