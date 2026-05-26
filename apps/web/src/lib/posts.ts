import { getPost, listPosts } from "@/lib/api";
import type { RecipePost } from "@/types/forkfit";

export async function loadPosts(): Promise<RecipePost[]> {
  return listPosts();
}

export async function loadPost(postId: string): Promise<RecipePost | null> {
  try {
    return await getPost(postId);
  } catch {
    return null;
  }
}
