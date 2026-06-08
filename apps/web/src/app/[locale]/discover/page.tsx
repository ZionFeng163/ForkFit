import { AppShell } from "@/components/app-shell";
import { DiscoverContent } from "@/components/discover-content";
import type { RecipePost } from "@/types/forkfit";

const API_BASE = process.env.FORKFIT_API_BASE_URL ?? "http://127.0.0.1:8000";

export default async function DiscoverPage() {
  // Fetch a larger batch to find the most popular post
  const res = await fetch(`${API_BASE}/posts?limit=50&offset=0`, {
    headers: { "Content-Type": "application/json" },
  });
  const allPosts = (await res.json()) as RecipePost[];
  const total = parseInt(res.headers.get("X-Total-Count") ?? String(allPosts.length), 10);

  // Pick the post with highest forks as featured
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
          featuredPost={featured ?? null}
        />
      </div>
    </AppShell>
  );
}
