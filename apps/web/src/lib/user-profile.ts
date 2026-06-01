import type { UserProfile } from "@/types/forkfit";

export const USER_PROFILE_STORAGE_KEY = "forkfit.userProfile.v1";

export type UserProfileForm = {
  people_count: string;
  budget: string;
  likes: string;
  dislikes: string;
  allergies: string;
  diet_rules: string;
  equipment: string;
  max_cook_time_minutes: string;
  soft_preferences: string;
};

export const defaultUserProfileForm: UserProfileForm = {
  people_count: "1",
  budget: "60",
  likes: "",
  dislikes: "",
  allergies: "",
  diet_rules: "",
  equipment: "",
  max_cook_time_minutes: "40",
  soft_preferences: "",
};

export function splitList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function profileFormToUserProfile(form: UserProfileForm): UserProfile {
  return {
    people_count: Number(form.people_count),
    budget: Number(form.budget),
    likes: splitList(form.likes),
    dislikes: splitList(form.dislikes),
    allergies: splitList(form.allergies),
    diet_rules: splitList(form.diet_rules),
    equipment: splitList(form.equipment),
    max_cook_time_minutes: Number(form.max_cook_time_minutes),
    soft_preferences: splitList(form.soft_preferences),
  };
}

export function loadUserProfileForm(): UserProfileForm {
  if (typeof window === "undefined") {
    return defaultUserProfileForm;
  }

  const raw = window.localStorage.getItem(USER_PROFILE_STORAGE_KEY);
  if (!raw) {
    return defaultUserProfileForm;
  }

  try {
    return {
      ...defaultUserProfileForm,
      ...(JSON.parse(raw) as Partial<UserProfileForm>),
    };
  } catch {
    return defaultUserProfileForm;
  }
}

export function saveUserProfileForm(form: UserProfileForm) {
  window.localStorage.setItem(USER_PROFILE_STORAGE_KEY, JSON.stringify(form));
}

// Backend persistence — sync localStorage with server
export async function syncProfileToBackend(form: UserProfileForm): Promise<void> {
  try {
    const { saveMyProfile } = await import("@/lib/api");
    await saveMyProfile(form as unknown as Record<string, unknown>);
  } catch {
    // Silently fail — localStorage is the primary store
  }
}

export async function loadProfileFromBackend(): Promise<UserProfileForm | null> {
  try {
    const { getMyProfile } = await import("@/lib/api");
    const result = await getMyProfile();
    if (result.profile) {
      const form = { ...defaultUserProfileForm, ...result.profile } as UserProfileForm;
      // Sync to localStorage
      window.localStorage.setItem(USER_PROFILE_STORAGE_KEY, JSON.stringify(form));
      return form;
    }
  } catch {
    // Silently fail — fall back to localStorage
  }
  return null;
}
