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
  likes: "rice bowls, vegetables",
  dislikes: "",
  allergies: "",
  diet_rules: "",
  equipment: "oven, stovetop, air fryer",
  max_cook_time_minutes: "40",
  soft_preferences: "less oily",
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

export function loadUserProfileForm() {
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
