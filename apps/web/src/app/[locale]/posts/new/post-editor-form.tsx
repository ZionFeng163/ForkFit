"use client";

import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { ImageUpload } from "@/components/image-upload";
import { useRouter } from "@/i18n/routing";
import { createPost, extractPost, updatePost } from "@/lib/api";
import type { CreatePostInput, RecipePost } from "@/types/forkfit";

type PostFormState = {
  title: string;
  theme: string;
  location: string;
  image_urls: string[];
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
  image_urls: [],
  description: "",
  recipe_name: "",
  ingredients: "",
  equipment: "",
  cook_time_minutes: "30",
  estimated_cost: "10",
  tags: "",
  notes: "",
};

export function PostEditorForm({ post }: { post?: RecipePost }) {
  const t = useTranslations("NewPost");
  const router = useRouter();
  const isEditing = Boolean(post);
  const [form, setForm] = useState<PostFormState>(() =>
    post ? formFromPost(post) : defaultForm
  );

  const mutation = useMutation({
    mutationFn: (input: CreatePostInput) =>
      post ? updatePost(post.id, input) : createPost(input),
    onSuccess: (savedPost) => {
      router.push(`/packs/${savedPost.id}`);
    },
  });
  const extractMutation = useMutation({
    mutationFn: () => {
      if (!post) {
        throw new Error("Post is required.");
      }
      return extractPost(post.id);
    },
    onSuccess: (savedPost) => {
      setForm(formFromPost(savedPost));
      router.push(`/packs/${savedPost.id}/edit`);
    },
  });

  function update(name: keyof PostFormState, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    mutation.mutate(buildInput(form));
  }

  function submitAndExtract() {
    if (!post) {
      return;
    }
    mutation.mutate(buildInput(form), {
      onSuccess: () => {
        extractMutation.mutate();
      },
    });
  }

  return (
    <form onSubmit={submit}>
      <div className="mb-5">
        <h1 className="text-2xl font-semibold tracking-0">
          {isEditing ? t("editTitle") : t("title")}
        </h1>
        <p className="mt-2 text-sm leading-6 text-[#625b52]">
          {t("description")}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="space-y-5">
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
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("imageUrls")}</label>
            <span className="block text-xs text-[#7a7167]">{t("imageHelp")}</span>
            <ImageUpload
              images={form.image_urls}
              onChange={(urls) => setForm((prev) => ({ ...prev, image_urls: urls }))}
            />
          </div>
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

      <aside className="h-fit rounded-lg border border-[#e4ded6] bg-white p-5 lg:sticky lg:top-6">
        <p className="text-sm leading-6 text-[#625b52]">{t("publishHelp")}</p>
        {mutation.error || extractMutation.error ? (
          <p className="mt-4 rounded-md border border-[#e1b7a9] bg-[#fff8f5] p-3 text-sm text-[#7f3525]">
            {t("failed")}
          </p>
        ) : null}
        <Button
          type="submit"
          disabled={mutation.isPending || extractMutation.isPending}
          className="mt-5 w-full"
        >
          {mutation.isPending ? <Loader2 size={16} className="animate-spin" /> : null}
          {isEditing ? t("save") : t("submit")}
        </Button>
        {isEditing ? (
          <button
            type="button"
            disabled={mutation.isPending || extractMutation.isPending}
            onClick={submitAndExtract}
            className="mt-3 h-10 w-full rounded-md border border-[#d8d0c6] bg-white px-4 text-sm font-medium text-[#625b52] hover:text-[#1f1f1f] disabled:opacity-50"
          >
            {extractMutation.isPending ? t("extracting") : t("saveAndExtract")}
          </button>
        ) : null}
      </aside>
      </div>
    </form>
  );
}

export function NewPostForm() {
  return <PostEditorForm />;
}

function buildInput(form: PostFormState): CreatePostInput {
  const title = form.title.trim();
  const recipeName = form.recipe_name.trim() || title;
  const description = form.description.trim();
  const ingredients = splitList(form.ingredients);

  return {
      title,
      theme: form.theme.trim() || "community recipe",
      location: form.location.trim() || "unknown",
      image_urls: form.image_urls.filter(Boolean),
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
        steps: [],
      },
  };
}

function formFromPost(post: RecipePost): PostFormState {
  return {
    title: post.title,
    theme: post.theme === "community recipe" ? "" : post.theme,
    location: post.location === "unknown" ? "" : post.location,
    image_urls: [...post.image_urls],
    description: post.description,
    recipe_name: post.recipe.name === post.title ? "" : post.recipe.name,
    ingredients:
      post.recipe.ingredients.length === 1 && post.recipe.ingredients[0] === post.title
        ? ""
        : post.recipe.ingredients.join(", "),
    equipment: post.recipe.equipment.join(", "),
    cook_time_minutes: String(post.recipe.cook_time_minutes || 30),
    estimated_cost: String(post.recipe.estimated_cost || 10),
    tags: post.recipe.tags.join(", "),
    notes: post.recipe.notes,
  };
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
