"use client";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  defaultUserProfileForm,
  loadUserProfileForm,
  saveUserProfileForm,
  type UserProfileForm,
} from "@/lib/user-profile";

export function ProfileForm() {
  const t = useTranslations("Profile");
  const fields = useTranslations("ProfileFields");
  const [form, setForm] = useState<UserProfileForm>(() => loadUserProfileForm());
  const [saved, setSaved] = useState(false);

  function update(name: keyof UserProfileForm, value: string) {
    setSaved(false);
    setForm((current) => ({ ...current, [name]: value }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    saveUserProfileForm(form);
    setSaved(true);
  }

  function resetDefaults() {
    setForm(defaultUserProfileForm);
    saveUserProfileForm(defaultUserProfileForm);
    setSaved(true);
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-0">{t("title")}</h1>
        <p className="mt-2 text-sm leading-6 text-[#625b52]">
          {t("description")}
        </p>
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

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit">{t("save")}</Button>
        <button
          type="button"
          onClick={resetDefaults}
          className="h-10 rounded-md border border-[#d8d0c6] bg-white px-4 text-sm font-medium text-[#625b52] hover:text-[#1f1f1f]"
        >
          {t("reset")}
        </button>
        {saved ? (
          <span className="inline-flex items-center gap-1 text-sm text-[#2f6b45]">
            <Check size={16} />
            {t("saved")}
          </span>
        ) : null}
      </div>
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
