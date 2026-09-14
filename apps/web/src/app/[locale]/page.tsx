import { Clock3 } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { HomePlannerEntry } from "@/components/home-planner-entry";
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
  const previewPosts = Array.from(new Map(
    [recommended[0], quick[0], homeCooking[0], vegetarian[0], ...recommended]
      .filter((post): post is RecipePost => Boolean(post))
      .map((post) => [post.id, post]),
  ).values()).slice(0, 3);
  const shown = new Set(previewPosts.map((post) => post.id));
  const sections = [quick, homeCooking, vegetarian].map((posts) => posts.filter((post) => {
    if (shown.has(post.id)) return false;
    return true;
  }).slice(0, 3).filter((post) => {
    shown.add(post.id);
    return true;
  }));

  return (
    <AppShell>
      <div className="site-container pb-16">
        <section className="home-planner">
          <div className="home-planner-copy">
            <h1>{isZh ? <><span>接下来几天，</span><span>吃什么？</span></> : "What should you eat next?"}</h1>
            <p>{isZh ? "选几道喜欢的菜，安排成适合你的菜单。" : "Pick recipes you like. Make a plan that fits."}</p>
          </div>
          <HomePlannerEntry />
        </section>

        <section className="home-plan-preview">
          <div className="home-section-heading">
            <div>
              <h2 className="section-heading">{previewPosts.length === 3 ? (isZh ? "先看看一份三日菜单" : "Preview a three-day menu") : (isZh ? "菜单预览" : "Menu preview")}</h2>
            </div>
            <span className="meta-text">{isZh ? "示例" : "Example"}</span>
          </div>
          {previewPosts.length > 0 ? (
            <div className="home-preview-grid">
              {previewPosts.map((post, index) => (
                <article key={post.id} className="home-preview-day">
                  <Link href={`/packs/${post.id}`} className="home-preview-image">
                    <RemoteImage src={post.image_urls[0] ?? ""} alt={post.title} className="h-full w-full object-cover" priority={index === 0} />
                  </Link>
                  <div className="home-preview-copy">
                    <span className="home-preview-kicker">{isZh ? `第 ${index + 1} 天` : `Day ${index + 1}`}</span>
                    <h3><Link href={`/packs/${post.id}`}>{post.title}</Link></h3>
                    <span className="home-preview-meta"><Clock3 size={14} />{post.recipe.cook_time_minutes} {isZh ? "分钟" : "min"}</span>
                  </div>
                </article>
              ))}
            </div>
          ) : <div className="state-panel py-12 text-center">{isZh ? "暂时没有可展示的菜谱" : "No recipes available"}</div>}
        </section>

        <HomeSection title={isZh ? "30 分钟内" : "Under 30 minutes"} posts={sections[0]} href="/discover?category=快手" more={isZh ? "查看全部" : "View all"} />
        <HomeSection title={isZh ? "家常菜" : "Home cooking"} posts={sections[1]} href="/discover?category=家常" more={isZh ? "查看全部" : "View all"} />
        <HomeSection title={isZh ? "素食灵感" : "Vegetarian ideas"} posts={sections[2]} href="/discover?category=素食" more={isZh ? "查看全部" : "View all"} />
      </div>

      <footer className="border-t border-[var(--separator)] bg-[var(--surface)] py-7">
        <div className="site-container text-xs text-[var(--muted)]">© 2026 ForkFit</div>
      </footer>
    </AppShell>
  );
}

function HomeSection({ title, posts, href, more }: { title: string; posts: RecipePost[]; href: string; more: string }) {
  if (posts.length === 0) return null;
  return (
    <section className="pt-10">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h2 className="section-heading">{title}</h2>
        </div>
        <Link href={href} className="text-sm font-semibold text-[var(--brand-hover)]">{more}</Link>
      </div>
      <div className="grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
        {posts.map((post) => <PostCard key={post.id} post={post} />)}
      </div>
    </section>
  );
}
