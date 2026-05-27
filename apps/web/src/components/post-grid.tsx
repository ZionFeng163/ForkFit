import { PostCard } from "@/components/post-card";
import type { RecipePost } from "@/types/forkfit";

export function PostGrid({ posts }: { posts: RecipePost[] }) {
  return (
    <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
      {posts.map((post) => (
        <div key={post.id}>
          <PostCard post={post} />
        </div>
      ))}
    </div>
  );
}
