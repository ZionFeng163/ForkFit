"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, ChevronUp, Loader2, Sparkles } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  defaultUserProfileForm,
  loadUserProfileForm,
  saveUserProfileForm,
  splitList,
  type UserProfileForm,
} from "@/lib/user-profile";
import { extractMyPreferences } from "@/lib/api";

export function ProfileForm() {
  const t = useTranslations("Profile");
  const fields = useTranslations("ProfileFields");
  const locale = useLocale();
  const [form, setForm] = useState<UserProfileForm>(() => loadUserProfileForm());
  const [extracting, setExtracting] = useState(false);
  const [extracted, setExtracted] = useState(false);

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
        setExtracted(true);
      }
    } catch {
      // Silently fail — user may not have posts
    } finally {
      setExtracting(false);
    }
  }
  const [saved, setSaved] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  function update(name: keyof UserProfileForm, value: string) {
    setSaved(false);
    setForm((current) => ({ ...current, [name]: value }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    saveUserProfileForm(form);
    // Also sync to backend (best-effort)
    import("@/lib/api").then(({ saveMyProfile }) => {
      saveMyProfile(form as unknown as Record<string, unknown>).catch(() => {});
    });
    setSaved(true);
  }

  function resetDefaults() {
    setForm(defaultUserProfileForm);
    saveUserProfileForm(defaultUserProfileForm);
    setSaved(true);
  }

  const hasAdvancedContent =
    form.equipment || form.diet_rules || form.soft_preferences || form.max_cook_time_minutes !== "40";

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-0">{t("title")}</h1>
        <p className="mt-2 text-sm leading-6 text-[#625b52]">
          {t("description")}
        </p>
      </div>

      {/* ── Primary ── */}
      <div className="grid gap-4 rounded-lg border border-[#e4ded6] bg-white p-5 sm:grid-cols-3">
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
            placeholder="60"
            value={form.budget}
            onChange={(event) => update("budget", event.target.value)}
            className="input"
          />
        </Field>
        <Field label={fields("allergies")} htmlFor="allergies">
          <input
            id="allergies"
            value={form.allergies}
            onChange={(event) => update("allergies", event.target.value)}
            className="input"
            placeholder={t("allergiesPlaceholder")}
          />
        </Field>
      </div>

      {/* ── Taste ── */}
      <div className="grid gap-4 rounded-lg border border-[#e4ded6] bg-white p-5 sm:grid-cols-2">
        <Field label={fields("likes")} htmlFor="likes">
          <input
            id="likes"
            value={form.likes}
            onChange={(event) => update("likes", event.target.value)}
            className="input"
            placeholder={t("likesPlaceholder")}
          />
        </Field>
        <Field label={fields("dislikes")} htmlFor="dislikes">
          <input
            id="dislikes"
            value={form.dislikes}
            onChange={(event) => update("dislikes", event.target.value)}
            className="input"
            placeholder={t("dislikesPlaceholder")}
          />
        </Field>
      </div>

      {/* ── Advanced (collapsed) ── */}
      <button
        type="button"
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="flex w-full items-center justify-between rounded-lg border border-[#e4ded6] bg-white px-5 py-3 text-sm font-medium text-[#625b52] hover:bg-[#faf8f5]"
      >
        <span className="flex items-center gap-2">
          {t("advancedOptions")}
          {hasAdvancedContent && (
            <span className="rounded-full bg-[#e4ded6] px-2 py-0.5 text-xs text-[#625b52]">
              {t("configured")}
            </span>
          )}
        </span>
        {showAdvanced ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {showAdvanced && (
        <div className="grid gap-4 rounded-lg border border-[#e4ded6] bg-white p-5 sm:grid-cols-2">
          <Field label={fields("equipment")} htmlFor="equipment">
            <input
              id="equipment"
              value={form.equipment}
              onChange={(event) => update("equipment", event.target.value)}
              className="input"
              placeholder={t("equipmentPlaceholder")}
            />
          </Field>
          <Field label={fields("dietRules")} htmlFor="diet_rules">
            <input
              id="diet_rules"
              value={form.diet_rules}
              onChange={(event) => update("diet_rules", event.target.value)}
              className="input"
              placeholder={t("dietRulesPlaceholder")}
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
              placeholder="40"
            />
          </Field>
          <Field label={fields("softPreferences")} htmlFor="soft_preferences">
            <input
              id="soft_preferences"
              value={form.soft_preferences}
              onChange={(event) => update("soft_preferences", event.target.value)}
              className="input"
              placeholder={t("softPreferencesPlaceholder")}
            />
          </Field>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit">{t("save")}</Button>
        <button
          type="button"
          onClick={handleExtract}
          disabled={extracting}
          className="h-10 rounded-md border border-[#d8d0c6] bg-white px-4 text-sm font-medium text-[#625b52] hover:text-[#1f1f1f] inline-flex items-center gap-2"
        >
          {extracting ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          {t("extractFromPosts")}
        </button>
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
