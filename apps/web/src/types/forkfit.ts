export type RunStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled" | "needs_input";
export type PostStatus = "draft" | "published" | "hidden";
export type PostQuality = "complete" | "missing_image" | "missing_steps" | "incomplete";

export type Meal = {
  id: string;
  day: string;
  name: string;
  ingredients: string[];
  equipment: string[];
  cook_time_minutes: number;
  tags: string[];
  notes: string;
  steps: string[];
  difficulty: string;
};

export type MealPack = {
  id: string;
  title: string;
  theme: string;
  meals: Meal[];
};

export type UserProfile = {
  people_count: number;
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
  description: string;
  safety_notices?: string[];
  quality_report?: {
    status: "pass" | "warn" | "block";
    issues: { code: string; severity: "low" | "medium" | "high"; meal_id: string; message: string }[];
    critic_used: boolean;
    repair_count: number;
  } | null;
};

export type CreateRunResponse = {
  run_id: string;
  status: RunStatus;
  queue_position?: number | null;
  estimated_wait_seconds?: number | null;
  user_message?: string | null;
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
  unresolved_payload: {
    items: { type: string; message: string; affected_items: string[]; suggested_action?: string }[];
    message: string;
    partial_result: RunResultPayload;
  } | null;
  saved: boolean;
  queue_position?: number | null;
  estimated_wait_seconds?: number | null;
  user_message?: string | null;
};

export type MealPlanSelectionInput = {
  days: number;
  people_count: number;
  request_text: string;
  selected_post_ids: string[];
  locale?: string;
  start_date?: string | null;
  user_profile: UserProfile;
};

export type MealPlanDish = {
  source_post_id: string;
  meal: Meal;
  reason: string;
};

export type MealPlanDay = {
  day_index: number;
  label: string;
  dishes: MealPlanDish[];
  reason: string;
};

export type MealPlanAgentReport = {
  agent: string;
  role: string;
  status: "completed" | "failed" | "skipped";
  summary: string;
  duration_ms: number;
};

export type MealPlanResult = {
  title: string;
  summary: string;
  mode: "guided" | "team";
  days: MealPlanDay[];
  shopping_list: { name: string; amount: string; used_on: number[] }[];
  prep_notes: string[];
  decision_summary: string;
  agent_reports: MealPlanAgentReport[];
  workflow_version: string;
};

export type CreateMealPlanResponse = {
  plan_id: string;
  status: RunStatus;
  mode: "guided" | "team";
};

export type MealPlanStatusResponse = {
  plan_id: string;
  user_id: string;
  status: RunStatus;
  mode: "guided" | "team";
  stage: string;
  progress: number;
  workflow_version: string;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  result: MealPlanResult | null;
  error: { message: string } | null;
  current_version_id?: string | null;
  conversation_id?: string | null;
  pending_message_id?: string | null;
  pending_change?: Record<string, unknown> | null;
  locked_days?: number[];
  last_change_summary?: string;
  editable?: boolean;
};

export type MealPlanMessage = {
  message_id: string;
  plan_id: string;
  base_version_id?: string | null;
  version_id?: string | null;
  role: "user" | "assistant" | "system";
  content: string;
  intent: string;
  status: string;
  response?: {
    message?: string;
    summary?: string;
    requires_confirmation?: boolean;
    changes?: Array<{
      day_index: number;
      before: string;
      after: string;
      changed_fields?: string[];
    }>;
  } | null;
  error?: { message: string } | null;
  created_at: string;
};

export type MealPlanConversation = {
  plan_id: string;
  current_version_id?: string | null;
  messages: MealPlanMessage[];
  pending_message_id?: string | null;
  pending_change?: Record<string, unknown> | null;
};

export type CreateMealPlanMessageResponse = {
  message_id: string;
  run_id: string;
  status: string;
  base_version_id?: string | null;
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
  likes: number;
  forks: number;
  description: string;
  recipe: Meal;
  status?: PostStatus;
  source_name?: string;
  source_url?: string;
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
  bio: string;
  location: string;
  role: string;
};

export type AdminStats = {
  user_count: number;
  post_count: number;
  published_posts: number;
  hidden_posts: number;
  draft_posts: number;
  active_runs: number;
  total_runs: number;
  ai_succeeded_runs: number;
  ai_failed_runs: number;
  today_new_posts: number;
  today_runs: number;
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
  status: PostStatus;
  source_name: string;
  source_url: string;
  quality: PostQuality;
  has_image: boolean;
  has_steps: boolean;
  created_at: string;
};

export type AdminRunFeedback = {
  id: number;
  run_id: string;
  user_id: string;
  rating: "helpful" | "not_helpful";
  reason: string;
  created_at: string;
};

export type AuthResponse = {
  access_token: string;
  token_type: string;
  user: UserInfoResponse;
};

export type ServiceHealth = {
  name: string;
  status: "ok" | "warn" | "error";
  latency_ms: number;
  details: string;
};

export type AdminHealthResponse = {
  services: ServiceHealth[];
};

export type ActivityItem = {
  type: "post" | "run" | "system";
  text: string;
  time: string;
  color: "green" | "blue" | "orange" | "red";
};

export type AdminActivityResponse = {
  activities: ActivityItem[];
};
