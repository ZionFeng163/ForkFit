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
    [recommended[0], quick[0], homeCooking[0], vegetarian[0]]
      .filter((post): post is RecipePost => Boolean(post))
      .map((post) => [post.id, post]),
  ).values()).slice(0, 3);

  return (
    <AppShell>
      <div className="site-container pb-16">
        <section className="home-planner">
          <div className="home-planner-copy">
            <h1>{isZh ? "接下来几天，吃什么？" : "What should you eat next?"}</h1>
            <p>{isZh ? "告诉我时间、口味和限制，我来安排一份能做出来的菜单。" : "Share your time, taste, and limits. We will shape a menu you can cook."}</p>
          </div>
          <HomePlannerEntry />
        </section>

        <section className="home-plan-preview">
          <div className="home-section-heading">
            <div>
              <h2 className="section-heading">{isZh ? "先看看一份三日菜单" : "Preview a three-day menu"}</h2>
              <p className="mt-1 text-sm text-[var(--muted-text)]">{isZh ? "你可以从现成菜谱开始，也可以直接说想吃什么。" : "Start with recipes or describe what you feel like eating."}</p>
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

        <HomeSection title={isZh ? "30 分钟内" : "Under 30 minutes"} description={isZh ? "工作日也能做" : "For busy weekdays"} posts={quick} href="/discover?category=快手" />
        <HomeSection title={isZh ? "家常菜" : "Home cooking"} description={isZh ? "适合常做的家常味" : "Recipes worth repeating"} posts={homeCooking} href="/discover?category=家常" />
        <HomeSection title={isZh ? "素食灵感" : "Vegetarian ideas"} description={isZh ? "把蔬菜吃得更有滋味" : "More ways to enjoy vegetables"} posts={vegetarian} href="/discover?category=素食" />

        <section className="home-process mt-12 grid gap-8 border-y border-[var(--line)] py-9 md:grid-cols-[0.8fr_2fr]">
          <div>
            <h2 className="section-heading">{isZh ? "从想吃什么，到真的做出来" : "From craving to a cookable plan"}</h2>
          </div>
          <ol className="grid gap-6 sm:grid-cols-3">
            {[isZh ? "说说这几天想吃什么" : "Describe your week", isZh ? "安排成每天的菜单" : "Shape a daily menu", isZh ? "不满意就继续调整" : "Keep refining it"].map((step, index) => (
              <li key={step} className="border-l border-[var(--line)] pl-4">
                <span className="text-xs font-semibold text-[var(--brand)]">0{index + 1}</span>
                <p className="mt-2 font-semibold">{step}</p>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <footer className="border-t border-[var(--separator)] bg-[var(--surface)] py-7">
        <div className="site-container text-xs text-[var(--muted)]">© 2026 ForkFit</div>
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
