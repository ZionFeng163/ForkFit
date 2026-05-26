"use client";

import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/routing";
import { createPost } from "@/lib/api";

type PostFormState = {
  title: string;
  theme: string;
  location: string;
  image_urls: string;
  description: string;
  recipe_name: string;
  ingredients: string;
  equipment: string;
  cook_time_minutes: string;
  estimated_cost: string;
  tags: string;
  notes: string;
};

const defaultForm: PostFormState = {
  title: "",
  theme: "",
  location: "",
  image_urls: "",
  description: "",
  recipe_name: "",
  ingredients: "",
  equipment: "",
  cook_time_minutes: "30",
  estimated_cost: "10",
  tags: "",
  notes: "",
};

export function NewPostForm() {
  const t = useTranslations("NewPost");
  const router = useRouter();
  const [form, setForm] = useState<PostFormState>(defaultForm);

  const mutation = useMutation({
    mutationFn: createPost,
    onSuccess: (post) => {
      router.push(`/packs/${post.id}`);
    },
  });

  function update(name: keyof PostFormState, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = form.title.trim();
    const recipeName = form.recipe_name.trim() || title;
    const description = form.description.trim();
    const ingredients = splitList(form.ingredients);

    mutation.mutate({
      title,
      theme: form.theme.trim() || "community recipe",
      location: form.location.trim() || "unknown",
      image_urls: form.image_urls
        .split("\n")
        .map((url) => url.trim())
        .filter(Boolean),
      description,
      recipe: {
        id: "main",
        day: "post",
        name: recipeName,
        ingredients: ingredients.length ? ingredients : [title],
        equipment: splitList(form.equipment),
        cook_time_minutes: Number(form.cook_time_minutes) || 30,
        estimated_cost: Number(form.estimated_cost) || 10,
        tags: splitList(form.tags),
        notes: form.notes.trim(),
      },
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-0">{t("title")}</h1>
          <p className="mt-2 text-sm leading-6 text-[#625b52]">
            {t("description")}
          </p>
        </div>

        <section className="space-y-4 rounded-lg border border-[#e4ded6] bg-white p-5">
          <h2 className="text-base font-semibold">{t("mainSection")}</h2>
          <Field label={t("titleLabel")} htmlFor="title">
            <input
              id="title"
              required
              value={form.title}
              placeholder={t("titlePlaceholder")}
              onChange={(event) => update("title", event.target.value)}
              className="input"
            />
          </Field>
          <Field label={t("descriptionLabel")} htmlFor="description">
            <textarea
              id="description"
              required
              rows={9}
              value={form.description}
              placeholder={t("descriptionPlaceholder")}
              onChange={(event) => update("description", event.target.value)}
              className="textarea"
            />
          </Field>
          <Field label={t("imageUrls")} htmlFor="image_urls" help={t("imageHelp")}>
            <textarea
              id="image_urls"
              required
              rows={4}
              value={form.image_urls}
              placeholder={t("imagePlaceholder")}
              onChange={(event) => update("image_urls", event.target.value)}
              className="textarea"
            />
          </Field>
        </section>

        <details className="rounded-lg border border-[#e4ded6] bg-white">
          <summary className="cursor-pointer list-none px-5 py-4 text-sm font-medium text-[#2f2a24]">
            {t("detailsSection")}
          </summary>
          <div className="space-y-4 border-t border-[#eee8df] p-5">
            <p className="text-sm leading-6 text-[#625b52]">{t("detailsHelp")}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("recipeName")} htmlFor="recipe_name">
                <input
                  id="recipe_name"
                  value={form.recipe_name}
                  placeholder={t("recipeNamePlaceholder")}
                  onChange={(event) => update("recipe_name", event.target.value)}
                  className="input"
                />
              </Field>
              <Field label={t("theme")} htmlFor="theme">
                <input
                  id="theme"
                  value={form.theme}
                  placeholder={t("themePlaceholder")}
                  onChange={(event) => update("theme", event.target.value)}
                  className="input"
                />
              </Field>
              <Field label={t("location")} htmlFor="location">
                <input
                  id="location"
                  value={form.location}
                  placeholder={t("locationPlaceholder")}
                  onChange={(event) => update("location", event.target.value)}
                  className="input"
                />
              </Field>
              <Field label={t("cookTime")} htmlFor="cook_time_minutes">
                <input
                  id="cook_time_minutes"
                  type="number"
                  min="1"
                  value={form.cook_time_minutes}
                  onChange={(event) => update("cook_time_minutes", event.target.value)}
                  className="input"
                />
              </Field>
              <Field label={t("cost")} htmlFor="estimated_cost">
                <input
                  id="estimated_cost"
                  type="number"
                  min="0"
                  step="0.1"
                  value={form.estimated_cost}
                  onChange={(event) => update("estimated_cost", event.target.value)}
                  className="input"
                />
              </Field>
              <Field label={t("ingredients")} htmlFor="ingredients" help={t("listHelp")}>
                <input
                  id="ingredients"
                  value={form.ingredients}
                  placeholder={t("ingredientsPlaceholder")}
                  onChange={(event) => update("ingredients", event.target.value)}
                  className="input"
                />
              </Field>
              <Field label={t("equipment")} htmlFor="equipment" help={t("listHelp")}>
                <input
                  id="equipment"
                  value={form.equipment}
                  placeholder={t("equipmentPlaceholder")}
                  onChange={(event) => update("equipment", event.target.value)}
                  className="input"
                />
              </Field>
              <Field label={t("tags")} htmlFor="tags" help={t("listHelp")}>
                <input
                  id="tags"
                  value={form.tags}
                  placeholder={t("tagsPlaceholder")}
                  onChange={(event) => update("tags", event.target.value)}
                  className="input"
                />
              </Field>
            </div>
            <Field label={t("notes")} htmlFor="notes">
              <textarea
                id="notes"
                rows={4}
                value={form.notes}
                placeholder={t("notesPlaceholder")}
                onChange={(event) => update("notes", event.target.value)}
                className="textarea"
              />
            </Field>
          </div>
        </details>
      </div>

      <aside className="h-fit rounded-lg border border-[#e4ded6] bg-white p-5">
        <p className="text-sm leading-6 text-[#625b52]">{t("publishHelp")}</p>
        {mutation.error ? (
          <p className="mt-4 rounded-md border border-[#e1b7a9] bg-[#fff8f5] p-3 text-sm text-[#7f3525]">
            {t("failed")}
          </p>
        ) : null}
        <Button type="submit" disabled={mutation.isPending} className="mt-5 w-full">
          {mutation.isPending ? <Loader2 size={16} className="animate-spin" /> : null}
          {t("submit")}
        </Button>
      </aside>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  help,
  children,
}: {
  label: string;
  htmlFor: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="space-y-1.5 text-sm font-medium">
      <span>{label}</span>
      {children}
      {help ? <span className="block text-xs text-[#7a7167]">{help}</span> : null}
    </label>
  );
}

function splitList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
