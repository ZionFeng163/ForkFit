import { AppShell } from "@/components/app-shell";
import { DiscoverContent } from "@/components/discover-content";
import type { RecipePost } from "@/types/forkfit";

const API_BASE = process.env.FORKFIT_API_BASE_URL ?? "http://127.0.0.1:8000";
const PAGE_SIZE = 18;

type DiscoverPageProps = {
  searchParams: Promise<{ q?: string; category?: string }>;
};

export default async function DiscoverPage({ searchParams }: DiscoverPageProps) {
  const query = await searchParams;
  const q = query.q?.trim() ?? "";
  const category = query.category?.trim() || "推荐";
  const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: "0", category });
  if (q) params.set("q", q);

  const response = await fetch(`${API_BASE}/posts?${params}`, { cache: "no-store" });
  if (!response.ok) throw new Error("Failed to load recipes");
  const fetched = await response.json() as RecipePost[];
  const total = Number.parseInt(response.headers.get("X-Total-Count") ?? String(fetched.length), 10);
  const featured = !q && category === "推荐"
    ? fetched.reduce<RecipePost | null>((best, post) => post.forks > (best?.forks ?? -1) ? post : best, null)
    : null;
  const posts = featured ? fetched.filter((post) => post.id !== featured.id) : fetched;

  return (
    <AppShell>
      <div className="site-container">
        <DiscoverContent
          initialPosts={posts}
          totalCount={total}
          initialOffset={fetched.length}
          featuredPost={featured}
          initialQuery={q}
          initialCategory={category}
        />
      </div>
    </AppShell>
  );
}
