import "server-only";

import { headers } from "next/headers";

import type { RecipePost } from "@/types/forkfit";

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
  const requestHeaders = await headers();
  const cookie = requestHeaders.get("cookie");
  const response = await fetch(serverApiUrl(`/posts/${encodeURIComponent(postId)}`), {
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
  });
  if (!response.ok) return null;
  return response.json() as Promise<RecipePost>;
}
