import { getPost } from "@/lib/api";
import type { RecipePost } from "@/types/forkfit";

const API_PROXY_PREFIX = "/api/backend";

function serverApiUrl(path: string) {
  const apiBase = process.env.FORKFIT_API_BASE_URL ?? "http://127.0.0.1:8000";
  return `${apiBase}${path}`;
}

export async function loadPosts(): Promise<{ posts: RecipePost[]; total: number }> {
  const res = await fetch(serverApiUrl("/posts?limit=20&offset=0"), {
    headers: { "Content-Type": "application/json" },
  });
  const posts = (await res.json()) as RecipePost[];
  const total = parseInt(res.headers.get("X-Total-Count") ?? String(posts.length), 10);
  return { posts, total };
}

export async function loadPost(postId: string): Promise<RecipePost | null> {
  try {
    return await getPost(postId);
  } catch {
    return null;
  }
}
