export type RunStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export type Meal = {
  id: string;
  day: string;
  name: string;
  ingredients: string[];
  equipment: string[];
  cook_time_minutes: number;
  estimated_cost: number;
  tags: string[];
  notes: string;
};

export type MealPack = {
  id: string;
  title: string;
  theme: string;
  meals: Meal[];
};

export type UserProfile = {
  people_count: number;
  budget: number;
  likes: string[];
  dislikes: string[];
  allergies: string[];
  diet_rules: string[];
  equipment: string[];
  max_cook_time_minutes: number;
  soft_preferences: string[];
};

export type AgentFinding = {
  type: string;
  severity: "low" | "medium" | "high";
  affected_items: string[];
  message: string;
  suggested_action?: string;
  required_action?: string;
};

export type AgentReview = {
  agent: string;
  status: "pass" | "warn" | "block";
  findings: AgentFinding[];
  scores: Record<string, number>;
};

export type ChangeLogEntry = {
  affected_item: string;
  from_value: string;
  to_value: string;
  reason: string;
  source_agent: string;
};

export type RunTrace = {
  steps: {
    node: string;
    duration_ms: number;
    status: "success" | "error";
    error?: string;
  }[];
  llm_calls: {
    agent: string;
    model: string;
    duration_ms: number;
    prompt_tokens: number | null;
    completion_tokens: number | null;
    status: "success" | "error";
    error?: string;
  }[];
};

export type RunResultPayload = {
  original_meal_pack: MealPack;
  forked_meal_pack: MealPack;
  change_log: ChangeLogEntry[];
  unresolved_items: AgentFinding[];
  final_review: AgentReview;
  summary: string;
};

export type CreateRunResponse = {
  run_id: string;
  status: RunStatus;
};

export type RunStatusResponse = {
  run_id: string;
  user_id: string;
  status: RunStatus;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  result: RunResultPayload | null;
  error: { message: string } | null;
  trace: RunTrace | null;
};

export type RecipePost = {
  id: string;
  user_id?: string;
  title: string;
  theme: string;
  author: string;
  location: string;
  image_urls: string[];
  saves: number;
  forks: number;
  description: string;
  recipe: Meal;
  created_at?: string;
  liked?: boolean;
  saved?: boolean;
  comment_count?: number;
};

export type CreatePostInput = {
  title: string;
  theme: string;
  location: string;
  image_urls: string[];
  description: string;
  recipe: Meal;
};

export type UpdatePostInput = CreatePostInput;

export type UserInfoResponse = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  role: string;
};

export type AdminStats = {
  user_count: number;
  post_count: number;
  active_runs: number;
};

export type AdminUser = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  role: string;
  created_at: string;
};

export type AdminPost = {
  id: string;
  title: string;
  author: string;
  user_id: string;
  created_at: string;
};

export type AuthResponse = {
  access_token: string;
  token_type: string;
  user: UserInfoResponse;
};
