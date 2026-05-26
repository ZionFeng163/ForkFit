import { PostCard } from "@/components/post-card";
import type { RecipePost } from "@/types/forkfit";

export function PostGrid({ posts }: { posts: RecipePost[] }) {
  return (
    <div className="columns-2 gap-4 md:columns-3 lg:columns-4">
      {posts.map((post) => (
        <div key={post.id} className="break-inside-avoid">
          <PostCard post={post} />
        </div>
      ))}
    </div>
  );
}
