import type { MealPack, RecipePost } from "@/types/forkfit";

export function mealPackFromPost(post: RecipePost): MealPack {
  return {
    id: post.id,
    title: post.title,
    theme: post.theme,
    meals: [post.recipe],
  };
}
