"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import type { RecipePost } from "@/types/forkfit";

const STORAGE_KEY = "forkfit.mealPlanSelection.v1";
const MAX_SELECTED = 7;

export type MealPlanSelection = {
  id: string;
  title: string;
  image_url: string;
  cook_time_minutes: number;
};

type MealPlanContextValue = {
  selected: MealPlanSelection[];
  hydrated: boolean;
  full: boolean;
  isSelected: (postId: string) => boolean;
  toggle: (post: RecipePost) => void;
  remove: (postId: string) => void;
  clear: () => void;
};

const MealPlanContext = createContext<MealPlanContextValue | null>(null);

export function MealPlanProvider({ children }: { children: React.ReactNode }) {
  const [selected, setSelected] = useState<MealPlanSelection[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as MealPlanSelection[];
        // Hydrate the client-only selection basket once from localStorage.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (Array.isArray(parsed)) setSelected(parsed.slice(0, MAX_SELECTED));
      }
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(selected));
  }, [hydrated, selected]);

  const isSelected = useCallback(
    (postId: string) => selected.some((item) => item.id === postId),
    [selected],
  );

  const toggle = useCallback((post: RecipePost) => {
    setSelected((current) => {
      if (current.some((item) => item.id === post.id)) {
        return current.filter((item) => item.id !== post.id);
      }
      if (current.length >= MAX_SELECTED) return current;
      return [
        ...current,
        {
          id: post.id,
          title: post.title,
          image_url: post.image_urls[0] ?? "",
          cook_time_minutes: post.recipe.cook_time_minutes,
        },
      ];
    });
  }, []);

  const remove = useCallback((postId: string) => {
    setSelected((current) => current.filter((item) => item.id !== postId));
  }, []);

  const clear = useCallback(() => setSelected([]), []);

  const value = useMemo(
    () => ({
      selected,
      hydrated,
      full: selected.length >= MAX_SELECTED,
      isSelected,
      toggle,
      remove,
      clear,
    }),
    [clear, hydrated, isSelected, remove, selected, toggle],
  );

  return (
    <MealPlanContext.Provider value={value}>
      {children}
    </MealPlanContext.Provider>
  );
}

export function useMealPlanSelection() {
  const context = useContext(MealPlanContext);
  if (!context) {
    throw new Error("useMealPlanSelection must be used inside MealPlanProvider");
  }
  return context;
}
