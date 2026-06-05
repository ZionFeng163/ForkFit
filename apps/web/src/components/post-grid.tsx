import { PostCard } from "@/components/post-card";
import type { RecipePost } from "@/types/forkfit";

export function PostGrid({ posts }: { posts: RecipePost[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {posts.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
    </div>
  );
}
