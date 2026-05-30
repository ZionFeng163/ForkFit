import type {
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
    throw new Error("Session expired");
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
    throw new Error(msg || `Request failed with ${response.status}`);
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
}) {
  return request<RecipePost>(`/runs/${runId}/publish`, {
    method: "POST",
    body: data ? JSON.stringify(data) : undefined,
  });
}

export function listRuns() {
  return request<RunStatusResponse[]>("/runs");
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
  return request<{ liked: boolean; saves: number }>(`/posts/${postId}/like`, {
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
  return request<{ id: string; username: string; display_name: string; avatar_url: string | null; post_count: number }>(`/users/${userId}`);
}

export function listUserPosts(userId: string, limit = 20, offset = 0) {
  return request<{ posts: RecipePost[]; total: number }>(`/users/${userId}/posts?limit=${limit}&offset=${offset}`);
}

export function listMyComments(limit = 50, offset = 0) {
  return request<{ comments: { id: string; post_id: string; content: string; created_at: string }[]; total: number }>(`/users/me/comments?limit=${limit}&offset=${offset}`);
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
