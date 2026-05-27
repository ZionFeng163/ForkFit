import type {
  CreatePostInput,
  CreateRunResponse,
  MealPack,
  RecipePost,
  RunStatusResponse,
  UpdatePostInput,
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
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed with ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function createRun(input: {
  user_profile: UserProfile;
  meal_pack: MealPack;
}) {
  return request<CreateRunResponse>("/runs", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getRun(runId: string) {
  return request<RunStatusResponse>(`/runs/${runId}`);
}

export function listPosts() {
  return request<RecipePost[]>("/posts");
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
