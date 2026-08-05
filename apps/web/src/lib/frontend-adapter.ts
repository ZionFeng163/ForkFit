import { listPostsPage } from "@/lib/api";
import type { RecipePost } from "@/types/forkfit";

export type AsyncState<T> =
  | { status: "idle" | "loading"; data: T | null; error: null }
  | { status: "success"; data: T; error: null }
  | { status: "error"; data: T | null; error: string };

export type RecipeSummary = Pick<RecipePost, "id" | "title" | "image_urls" | "description" | "recipe" | "theme" | "author" | "likes" | "saves" | "forks">;

export type HomeViewModel = {
  featured: RecipeSummary | null;
  sections: Array<{ key: string; title: string; posts: RecipeSummary[] }>;
};

export type MealPlanDraft = {
  days: number;
  peopleCount: number;
  requestText: string;
  selectedRecipeIds: string[];
};

export type PlanAction =
  | { type: "add_recipe"; recipeId: string }
  | { type: "remove_recipe"; recipeId: string }
  | { type: "lock_day"; dayIndex: number }
  | { type: "send_message"; text: string };

export type RecipeQuery = {
  limit?: number;
  offset?: number;
  query?: string;
  category?: string;
};

export interface ForkFitFrontendAdapter {
  listRecipes(query?: RecipeQuery): Promise<{ posts: RecipePost[]; total: number }>;
}

const fixtureRecipe: RecipePost = {
  id: "fixture-home-recipe",
  title: "番茄鸡蛋面",
  theme: "家常",
  author: "ForkFit 示例",
  location: "",
  image_urls: [],
  saves: 0,
  likes: 0,
  forks: 0,
  description: "一份适合工作日的家常面食。",
  recipe: {
    id: "fixture-home-recipe",
    day: "",
    name: "番茄鸡蛋面",
    ingredients: ["番茄 2 个", "鸡蛋 2 个", "面条 1 份"],
    equipment: ["炒锅"],
    cook_time_minutes: 20,
    tags: ["家常", "快手"],
    notes: "",
    steps: ["番茄切块，鸡蛋打散。", "先炒鸡蛋，再加入番茄炒出汁。", "加水煮开，放入面条煮熟。"],
    difficulty: "easy",
  },
};

const realAdapter: ForkFitFrontendAdapter = {
  listRecipes: ({ limit = 18, offset = 0, query = "", category = "" } = {}) =>
    listPostsPage(limit, offset, query, "", category),
};

const fixtureAdapter: ForkFitFrontendAdapter = {
  async listRecipes({ query = "", category = "" } = {}) {
    const matches = !query && (!category || category === "推荐")
      ? [fixtureRecipe]
      : [];
    return { posts: matches, total: matches.length };
  },
};

export function getFrontendAdapter(): ForkFitFrontendAdapter {
  const useFixtures = process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_FORKFIT_FIXTURES === "true";
  return useFixtures ? fixtureAdapter : realAdapter;
}
