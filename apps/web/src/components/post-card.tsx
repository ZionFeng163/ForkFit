import { Clock, DollarSign, GitFork, Heart } from "lucide-react";

import { RemoteImage } from "@/components/remote-image";
import { Link } from "@/i18n/routing";
import type { RecipePost } from "@/types/forkfit";

export function PostCard({ post }: { post: RecipePost }) {
  const tags = post.recipe.tags.slice(0, 3);
  const showMeta = isMeaningfulRecipe(post);

  return (
    <Link
      href={`/packs/${post.id}`}
      className="mb-4 block overflow-hidden rounded-lg border border-[#e4ded6] bg-white transition-colors hover:border-[#cfc5b8]"
    >
      <div className="relative aspect-[4/5] bg-[#eee9e2]">
        <RemoteImage
          src={post.image_urls[0]}
          alt={post.title}
          className="h-full w-full object-cover"
        />
      </div>
      <div className="space-y-3 p-3">
        <div>
          <h2 className="line-clamp-2 text-[15px] font-semibold leading-5">
            {post.title}
          </h2>
          <p className="mt-1 line-clamp-2 text-[13px] leading-5 text-[#6f6a61]">
            {post.description}
          </p>
        </div>
        {tags.length ? (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <span
                key={tag}
                className="rounded-md border border-[#e5ded5] px-1.5 py-0.5 text-[12px] text-[#625b52]"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}
        {showMeta ? (
          <div className="grid grid-cols-3 gap-2 border-t border-[#eee8df] pt-3 text-[12px] text-[#625b52]">
            <span className="flex items-center gap-1">
              <Clock size={14} />
              {post.recipe.cook_time_minutes}m
            </span>
            <span className="flex items-center gap-1">
              <DollarSign size={14} />
              {post.recipe.estimated_cost.toFixed(0)}
            </span>
            <span className="flex items-center gap-1">
              <GitFork size={14} />
              {post.forks}
            </span>
          </div>
        ) : null}
        <div className="flex items-center justify-between text-[13px] text-[#6f6a61]">
          <span>{post.author}</span>
          <span className="flex items-center gap-1">
            <Heart size={14} />
            {post.saves}
          </span>
        </div>
      </div>
    </Link>
  );
}

function isMeaningfulRecipe(post: RecipePost) {
  const recipe = post.recipe;
  const hasRealIngredients = !(
    recipe.ingredients.length === 1 && recipe.ingredients[0] === post.title
  );
  return (
    hasRealIngredients ||
    recipe.equipment.length > 0 ||
    recipe.tags.length > 0 ||
    Boolean(recipe.notes) ||
    recipe.cook_time_minutes !== 30 ||
    recipe.estimated_cost !== 10
  );
}
