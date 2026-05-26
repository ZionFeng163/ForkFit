"use client";

import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Link, useRouter } from "@/i18n/routing";
import { createRun } from "@/lib/api";
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
  const [savedProfile] = useState<UserProfileForm>(() => loadUserProfileForm());
  const [form, setForm] = useState<UserProfileForm>(() => loadUserProfileForm());

  const mutation = useMutation({
    mutationFn: createRun,
    onSuccess: (response) => {
      router.push(`/runs/${response.run_id}`);
    },
  });

  function update(name: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  function resetToProfile() {
    setForm(savedProfile);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    mutation.mutate({
      user_profile: profileFormToUserProfile(form),
      meal_pack: mealPack,
    });
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <Link
        href={`/packs/${mealPack.id}`}
        className="inline-flex items-center gap-2 text-sm text-[#625b52] hover:text-[#1f1f1f]"
      >
        <ArrowLeft size={16} />
        {t("back")}
      </Link>

      <div>
        <h1 className="text-2xl font-semibold tracking-0">
          {t("title", { title: mealPack.title })}
        </h1>
        <p className="mt-2 text-sm leading-6 text-[#625b52]">
          {t("description")}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[#e4ded6] bg-white p-4 text-sm text-[#625b52]">
        <span>{t("profileNote")}</span>
        <Link className="font-medium text-[#2f2a24] hover:underline" href="/profile">
          {t("editProfile")}
        </Link>
        <button
          type="button"
          onClick={resetToProfile}
          className="font-medium text-[#2f2a24] hover:underline"
        >
          {t("resetToProfile")}
        </button>
      </div>

      <div className="grid gap-4 rounded-lg border border-[#e4ded6] bg-white p-5 sm:grid-cols-2">
        <Field label={fields("people")} htmlFor="people_count">
          <input
            id="people_count"
            type="number"
            min="1"
            value={form.people_count}
            onChange={(event) => update("people_count", event.target.value)}
            className="input"
          />
        </Field>
        <Field label={fields("budget")} htmlFor="budget">
          <input
            id="budget"
            type="number"
            min="0"
            value={form.budget}
            onChange={(event) => update("budget", event.target.value)}
            className="input"
          />
        </Field>
        <Field label={fields("likes")} htmlFor="likes">
          <input
            id="likes"
            value={form.likes}
            onChange={(event) => update("likes", event.target.value)}
            className="input"
          />
        </Field>
        <Field label={fields("dislikes")} htmlFor="dislikes">
          <input
            id="dislikes"
            value={form.dislikes}
            onChange={(event) => update("dislikes", event.target.value)}
            className="input"
          />
        </Field>
        <Field label={fields("allergies")} htmlFor="allergies">
          <input
            id="allergies"
            value={form.allergies}
            onChange={(event) => update("allergies", event.target.value)}
            className="input"
          />
        </Field>
        <Field label={fields("dietRules")} htmlFor="diet_rules">
          <input
            id="diet_rules"
            value={form.diet_rules}
            onChange={(event) => update("diet_rules", event.target.value)}
            className="input"
          />
        </Field>
        <Field label={fields("equipment")} htmlFor="equipment">
          <input
            id="equipment"
            value={form.equipment}
            onChange={(event) => update("equipment", event.target.value)}
            className="input"
          />
        </Field>
        <Field label={fields("maxCookTime")} htmlFor="max_cook_time_minutes">
          <input
            id="max_cook_time_minutes"
            type="number"
            min="1"
            value={form.max_cook_time_minutes}
            onChange={(event) =>
              update("max_cook_time_minutes", event.target.value)
            }
            className="input"
          />
        </Field>
        <Field label={fields("softPreferences")} htmlFor="soft_preferences">
          <input
            id="soft_preferences"
            value={form.soft_preferences}
            onChange={(event) => update("soft_preferences", event.target.value)}
            className="input"
          />
        </Field>
      </div>

      {mutation.error ? (
        <p className="rounded-md border border-[#e1b7a9] bg-[#fff8f5] p-3 text-sm text-[#7f3525]">
          {mutation.error.message}
        </p>
      ) : null}

      <Button
        type="submit"
        disabled={mutation.isPending}
      >
        {mutation.isPending ? <Loader2 size={16} className="animate-spin" /> : null}
        {t("runFork")}
      </Button>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="space-y-1.5 text-sm font-medium">
      <span>{label}</span>
      {children}
    </label>
  );
}
