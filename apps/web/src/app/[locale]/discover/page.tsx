import { AppShell } from "@/components/app-shell";
import { DiscoverContent } from "@/components/discover-content";
import type { RecipePost } from "@/types/forkfit";

const API_BASE = process.env.FORKFIT_API_BASE_URL ?? "http://127.0.0.1:8000";
const PAGE_SIZE = 20;

export default async function DiscoverPage() {
  const params = new URLSearchParams({
    limit: String(PAGE_SIZE),
    offset: "0",
    category: "推荐",
  });
  const res = await fetch(`${API_BASE}/posts?${params}`, {
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Failed to load recipes");

  const allPosts = (await res.json()) as RecipePost[];
  const total = parseInt(res.headers.get("X-Total-Count") ?? String(allPosts.length), 10);

  // Feature the most popular post from the first page without consuming later offsets.
  const featured = allPosts.reduce((best, post) =>
    post.forks > (best?.forks ?? 0) ? post : best
  , allPosts[0] as RecipePost | undefined);

  // Remove featured from the grid list
  const gridPosts = featured
    ? allPosts.filter((p) => p.id !== featured.id)
    : allPosts;

  return (
    <AppShell>
      <div className="mx-auto max-w-[1120px] px-7 pb-20">
        <DiscoverContent
          initialPosts={gridPosts}
          totalCount={total}
          initialOffset={allPosts.length}
          featuredPost={featured ?? null}
        />
      </div>
    </AppShell>
  );
}
