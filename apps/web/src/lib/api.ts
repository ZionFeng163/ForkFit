import type {
  AdminActivityResponse,
  AdminHealthResponse,
  AdminPost,
  AdminStats,
  AdminUser,
  AuthResponse,
  CreatePostInput,
  CreateRunResponse,
  MealPack,
  RecipePost,
  RunStatusResponse,
  UpdatePostInput,
  UserInfoResponse,
  UserProfile,
} from "@/types/forkfit";

const API_PROXY_PREFIX = "/api/backend";

function apiUrl(path: string) {
  if (typeof window !== "undefined") {
    return `${API_PROXY_PREFIX}${path}`;
  }
  const apiBase = process.env.FORKFIT_API_BASE_URL ?? "http://127.0.0.1:8000";
  return `${apiBase}${path}`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(path), {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...Object.fromEntries(Object.entries(init?.headers ?? {})),
    },
  });

  if (response.status === 401) {
    // Redirect to login on client side, but NOT if already on login page
    if (typeof window !== "undefined") {
      const currentPath = window.location.pathname;
      if (!currentPath.includes("/login")) {
        window.location.href = `/login?returnTo=${encodeURIComponent(currentPath)}`;
      }
    }
    throw new Error("请先登录");
  }

  if (!response.ok) {
    const text = await response.text();
    let msg = text;
    try {
      const body = JSON.parse(text);
      if (body.detail) {
        if (typeof body.detail === "string") msg = body.detail;
        else if (Array.isArray(body.detail)) msg = body.detail.map((d: { msg?: string }) => d.msg).join(", ");
      }
    } catch {}
    // Make validation errors user-friendly
    msg = msg
      .replace(/List should have at least 1 item after validation, not 0/g, "请至少填写一项内容")
      .replace(/String should have at least \d+ character/g, "此项不能为空")
      .replace(/Field required/g, "请填写必填项")
      .replace(/value is not a valid/g, "格式不正确");
    throw new Error(msg || "请求失败，请稍后重试");
  }

  return response.json() as Promise<T>;
}

export function registerUser(input: {
  username: string;
  password: string;
  display_name?: string;
  avatar_url?: string;
}) {
  return request<AuthResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function loginUser(input: { username: string; password: string }) {
  return request<AuthResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getCurrentUser() {
  return request<UserInfoResponse>("/auth/me");
}

export function logoutUser() {
  return request<void>("/auth/logout", { method: "POST" });
}

export function createRun(input: {
  user_profile: UserProfile;
  meal_pack: MealPack;
  locale?: string;
}) {
  return request<CreateRunResponse>("/runs", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getRun(runId: string) {
  return request<RunStatusResponse>(`/runs/${runId}`);
}

export function publishRun(runId: string, data?: {
  title?: string;
  description?: string;
  image_urls?: string[];
  recipe_name?: string;
  ingredients?: string[];
  equipment?: string[];
  cook_time_minutes?: number;
  estimated_cost?: number;
  tags?: string[];
  notes?: string;
  steps?: string[];
}) {
  return request<RecipePost>(`/runs/${runId}/publish`, {
    method: "POST",
    body: data ? JSON.stringify(data) : undefined,
  });
}

export function listRuns() {
  return request<RunStatusResponse[]>("/runs");
}

export function saveRun(runId: string) {
  return request<RunStatusResponse>(`/runs/${runId}/save`, { method: "POST" });
}

export function unsaveRun(runId: string) {
  return request<RunStatusResponse>(`/runs/${runId}/save`, { method: "DELETE" });
}

export function resolveRun(runId: string, substitutions: Record<string, string>) {
  return request<RunStatusResponse>(`/runs/${runId}/resolve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ substitutions }),
  });
}

export function listSavedRuns() {
  return request<RunStatusResponse[]>("/runs/saved");
}

export function listPosts(limit = 20, offset = 0, q = "", tag = "") {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (q) params.set("q", q);
  if (tag) params.set("tag", tag);
  return request<RecipePost[]>(`/posts?${params}`);
}

export function listTags() {
  return request<string[]>("/posts/tags");
}

export function getPost(postId: string) {
  return request<RecipePost>(`/posts/${postId}`);
}

export function createPost(input: CreatePostInput) {
  return request<RecipePost>("/posts", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updatePost(postId: string, input: UpdatePostInput) {
  return request<RecipePost>(`/posts/${postId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function extractPost(postId: string) {
  return request<RecipePost>(`/posts/${postId}/extract`, {
    method: "POST",
  });
}

export function deletePost(postId: string) {
  return request<void>(`/posts/${postId}`, { method: "DELETE" });
}

// --- Admin ---

export function getAdminStats() {
  return request<AdminStats>("/admin/stats");
}

export function getAdminHealth() {
  return request<AdminHealthResponse>("/admin/health");
}

export function getAdminActivity() {
  return request<AdminActivityResponse>("/admin/activity");
}

export function listAdminUsers(limit = 50, offset = 0) {
  return request<{ users: AdminUser[]; total: number }>(`/admin/users?limit=${limit}&offset=${offset}`);
}

export function updateAdminUser(userId: string, data: { display_name?: string; avatar_url?: string; role?: string }) {
  return request<AdminUser>(`/admin/users/${userId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function deleteAdminUser(userId: string) {
  return request<void>(`/admin/users/${userId}`, { method: "DELETE" });
}

export function listAdminPosts(limit = 50, offset = 0) {
  return request<{ posts: AdminPost[]; total: number }>(`/admin/posts?limit=${limit}&offset=${offset}`);
}

export function deleteAdminPost(postId: string) {
  return request<void>(`/admin/posts/${postId}`, { method: "DELETE" });
}

export function batchDeleteAdminUsers(ids: string[]) {
  return request<{ deleted: number }>("/admin/users/batch-delete", {
    method: "POST",
    body: JSON.stringify({ ids }),
  });
}

export function batchDeleteAdminPosts(ids: string[]) {
  return request<{ deleted: number }>("/admin/posts/batch-delete", {
    method: "POST",
    body: JSON.stringify({ ids }),
  });
}

// --- Interactions ---

export function toggleLike(postId: string) {
  return request<{ liked: boolean; likes: number; saves: number }>(`/posts/${postId}/like`, {
    method: "POST",
  });
}

export function toggleSave(postId: string) {
  return request<{ saved: boolean; saves: number }>(`/posts/${postId}/save`, {
    method: "POST",
  });
}

export function listLikedPosts(limit = 20, offset = 0) {
  return request<RecipePost[]>(`/posts/liked/me?limit=${limit}&offset=${offset}`);
}

export function listSavedPosts(limit = 20, offset = 0) {
  return request<RecipePost[]>(`/posts/saved/me?limit=${limit}&offset=${offset}`);
}

// --- User profiles ---

export function getUserProfile(userId: string) {
  return request<{ id: string; username: string; display_name: string; avatar_url: string | null; bio: string; location: string; post_count: number; created_at?: string }>(`/users/${userId}`);
}

export function listUserPosts(userId: string, limit = 20, offset = 0) {
  return request<{ posts: RecipePost[]; total: number }>(`/users/${userId}/posts?limit=${limit}&offset=${offset}`);
}

export function listMyComments(limit = 50, offset = 0) {
  return request<{ comments: { id: string; post_id: string; content: string; created_at: string }[]; total: number }>(`/users/me/comments?limit=${limit}&offset=${offset}`);
}

// --- User Preference Extraction ---

export function extractMyPreferences(locale = "en") {
  return request<{ preferences: Record<string, unknown> }>(`/users/me/extract-preferences`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ locale }),
  });
}

export function getMyExtractedPreferences() {
  return request<{ preferences: Record<string, unknown> | null }>(`/users/me/extracted-preferences`);
}

export function getMyProfile() {
  return request<{ profile: Record<string, unknown> | null }>(`/users/me/profile`);
}

export function saveMyProfile(profile: Record<string, unknown>) {
  return request<{ ok: boolean }>(`/users/me/profile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(profile),
  });
}

export function updateMe(data: { display_name?: string; bio?: string; location?: string }) {
  return request<{ id: string; username: string; display_name: string; avatar_url: string | null; bio: string; location: string }>(`/users/me`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

// --- Follow ---

export function followUser(userId: string) {
  return request<{ following: boolean }>(`/users/${userId}/follow`, { method: "POST" });
}

export function unfollowUser(userId: string) {
  return request<{ following: boolean }>(`/users/${userId}/follow`, { method: "DELETE" });
}

export function listFollowers(userId: string, limit = 50, offset = 0) {
  return request<{ users: { id: string; username: string; display_name: string; avatar_url: string | null }[]; total: number }>(
    `/users/${userId}/followers?limit=${limit}&offset=${offset}`
  );
}

export function listFollowing(userId: string, limit = 50, offset = 0) {
  return request<{ users: { id: string; username: string; display_name: string; avatar_url: string | null }[]; total: number }>(
    `/users/${userId}/following?limit=${limit}&offset=${offset}`
  );
}

export function getFollowStats() {
  return request<{ followers: number; following: number }>("/users/me/follow-stats");
}

// --- Comments ---

export type Comment = {
  id: string;
  post_id: string;
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  content: string;
  created_at: string;
  can_delete: boolean;
};

export function listComments(postId: string, limit = 50, offset = 0) {
  return request<{ comments: Comment[]; total: number }>(`/posts/${postId}/comments?limit=${limit}&offset=${offset}`);
}

export function createComment(postId: string, content: string) {
  return request<Comment>(`/posts/${postId}/comments`, {
    method: "POST",
    body: JSON.stringify({ content }),
  });
}

export function deleteComment(postId: string, commentId: string) {
  return request<void>(`/posts/${postId}/comments/${commentId}`, { method: "DELETE" });
}
