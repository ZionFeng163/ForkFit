"use client";

import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Sparkles, Settings2, ChevronDown, ChevronUp, UserPen } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Link, useRouter } from "@/i18n/routing";
import { createRun, extractMyPreferences } from "@/lib/api";
import {
  loadUserProfileForm,
  profileFormToUserProfile,
  type UserProfileForm,
} from "@/lib/user-profile";
import type { MealPack } from "@/types/forkfit";

export function ForkForm({ mealPack }: { mealPack: MealPack }) {
  const t = useTranslations("Fork");
  const fields = useTranslations("ProfileFields");
  const router = useRouter();
  const locale = useLocale();
  const [form, setForm] = useState<UserProfileForm>(() => loadUserProfileForm());
  const [showTweaks, setShowTweaks] = useState(false);
  const [extracting, setExtracting] = useState(false);

  const mutation = useMutation({
    mutationFn: createRun,
    onSuccess: (response) => {
      router.push(`/runs/${response.run_id}`);
    },
  });

  function update(name: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    mutation.mutate({
      user_profile: profileFormToUserProfile(form),
      meal_pack: mealPack,
      locale,
    });
  }

  async function handleExtract() {
    setExtracting(true);
    try {
      const result = await extractMyPreferences(locale);
      const prefs = result.preferences;
      if (prefs && prefs.extracted) {
        setForm((prev) => ({
          ...prev,
          likes: (prefs.likes as string[])?.join(", ") || prev.likes,
          dislikes: (prefs.dislikes as string[])?.join(", ") || prev.dislikes,
          diet_rules: (prefs.diet_rules as string[])?.join(", ") || prev.diet_rules,
          equipment: (prefs.equipment as string[])?.join(", ") || prev.equipment,
          soft_preferences: (prefs.soft_preferences as string[])?.join(", ") || prev.soft_preferences,
        }));
      }
    } catch { /* silently fail */ }
    setExtracting(false);
  }

  const firstMeal = mealPack.meals[0];

  return (
    <form onSubmit={submit} className="space-y-5">
      <Link
        href={`/packs/${mealPack.id}`}
        className="inline-flex items-center gap-2 text-sm text-[#625b52] hover:text-[#1f1f1f]"
      >
        <ArrowLeft size={16} />
        {t("back")}
      </Link>

      {/* ── Pack summary card ── */}
      <div className="rounded-lg border border-[#e4ded6] bg-white p-5">
        <h1 className="text-xl font-semibold tracking-0">
          {t("title", { title: mealPack.title })}
        </h1>
        <p className="mt-1 text-sm text-[#625b52]">
          {t("oneClickDescription")}
        </p>
        {firstMeal && (
          <div className="mt-3 flex flex-wrap gap-3 text-xs text-[#7a7167]">
            {firstMeal.cook_time_minutes > 0 && <span>⏱ {firstMeal.cook_time_minutes} min</span>}
            {firstMeal.ingredients.length > 0 && <span>🥘 {firstMeal.ingredients.slice(0, 4).join(", ")}{firstMeal.ingredients.length > 4 ? "..." : ""}</span>}
          </div>
        )}
      </div>

      {/* ── Quick tweaks (collapsible) ── */}
      <button
        type="button"
        onClick={() => setShowTweaks(!showTweaks)}
        className="flex w-full items-center justify-between rounded-lg border border-[#e4ded6] bg-white px-4 py-3 text-sm text-[#625b52] hover:bg-[#faf8f5]"
      >
        <span className="flex items-center gap-2">
          <Settings2 size={14} />
          {t("quickTweaks")}
        </span>
        {showTweaks ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {showTweaks && (
        <div className="grid gap-3 rounded-lg border border-[#e4ded6] bg-white p-4 sm:grid-cols-2">
          <label className="space-y-1 text-sm font-medium">
            <span>{fields("people")}</span>
            <input
              type="number" min="1"
              value={form.people_count}
              onChange={(e) => update("people_count", e.target.value)}
              className="input"
            />
          </label>
          <label className="space-y-1 text-sm font-medium">
            <span>{fields("allergies")}</span>
            <input
              value={form.allergies}
              onChange={(e) => update("allergies", e.target.value)}
              className="input"
              placeholder={t("allergiesPlaceholder")}
            />
          </label>
        </div>
      )}

      {/* ── Actions ── */}
      <div className="flex items-center gap-2">
        <Button type="submit" disabled={mutation.isPending} className="flex-1">
          {mutation.isPending ? <Loader2 size={16} className="animate-spin" /> : null}
          <span className="ml-2">{t("runFork")}</span>
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={handleExtract}
          disabled={extracting}
        >
          {extracting ? <Loader2 className="animate-spin" /> : <Sparkles />}
          {t("extractFromPosts")}
        </Button>
        <Button asChild variant="outline">
          <Link href="/profile"><UserPen />{t("editProfile")}</Link>
        </Button>
      </div>

      {mutation.error && (
        <p className="rounded-md border border-[#e1b7a9] bg-[#fff8f5] p-3 text-sm text-[#7f3525]">
          {mutation.error.message}
        </p>
      )}
    </form>
  );
}
