import { ArrowLeft, Clock, MapPin } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { CommentSection } from "@/components/comment-section";
import { RemoteImage } from "@/components/remote-image";
import { PostSidebar } from "@/components/post-sidebar";
import { Link } from "@/i18n/routing";
import { loadPost } from "@/lib/posts";
import type { RecipePost } from "@/types/forkfit";

type PageProps = {
  params: Promise<{ locale: string; packId: string }>;
};

export default async function PackDetailPage({ params }: PageProps) {
  const { locale, packId } = await params;
  const t = await getTranslations({ locale, namespace: "Pack" });
  const post = await loadPost(packId);

  if (!post) {
    notFound();
  }

  const recipe = post.recipe;
  const hasRecipeDetails = isMeaningfulRecipe(post);
  const ingredients = getUsefulIngredients(post);
  const usefulNotes = getUsefulNotes(post);
  const hasTheme = post.theme !== "community recipe";
  const hasLocation = post.location !== "unknown";

  return (
    <AppShell>
      <section className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <Link
          href="/"
          className="mb-5 inline-flex items-center gap-2 text-sm text-[#625b52] hover:text-[#1f1f1f]"
        >
          <ArrowLeft size={16} />
          {t("back")}
        </Link>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="overflow-hidden rounded-lg border border-[#e4ded6] bg-white">
            {post.image_urls.length > 0 && (
              <div className="flex snap-x gap-3 overflow-x-auto bg-[#eee9e2] p-3">
                {post.image_urls.map((imageUrl, index) => (
                  <div
                    key={imageUrl}
                    className="relative aspect-[16/11] w-full min-w-full snap-center overflow-hidden rounded-md bg-[#e5ded5]"
                  >
                    <RemoteImage
                      src={imageUrl}
                      alt={`${post.title} ${index + 1}`}
                      className="h-full w-full object-cover"
                    />
                  </div>
                ))}
              </div>
            )}
            <div className="space-y-5 p-5">
              <div>
                <h1 className="text-2xl font-semibold tracking-0">{post.title}</h1>
                <p className="mt-2 text-sm leading-6 text-[#625b52]">
                  {post.description}
                </p>
              </div>

              {hasRecipeDetails || hasLocation ? (
                <div className="flex gap-4 border-y border-[#eee8df] py-4 text-sm text-[#5f5a52]">
                  {hasRecipeDetails ? (
                    <>
                      <span className="flex items-center gap-2">
                        <Clock size={16} />
                        {t("minutes", { count: recipe.cook_time_minutes })}
                      </span>
                    </>
                  ) : null}
                  {hasLocation ? (
                    <span className="flex items-center gap-2">
                      <MapPin size={16} />
                      {post.location}
                    </span>
                  ) : null}
                </div>
              ) : null}

              {hasRecipeDetails ? (
                <dl className="grid gap-4 border-t border-[#eee8df] pt-4 text-sm sm:grid-cols-2">
                  {ingredients.length ? (
                    <InfoItem label={t("ingredients")} value={ingredients.join(", ")} />
                  ) : null}
                  {recipe.equipment.length ? (
                    <InfoItem
                      label={t("equipment")}
                      value={recipe.equipment.join(", ")}
                    />
                  ) : null}
                  {recipe.tags.length ? (
                    <InfoItem label={t("tags")} value={recipe.tags.join(", ")} />
                  ) : null}
                  {usefulNotes ? (
                    <InfoItem label={t("notes")} value={usefulNotes} />
                  ) : null}
                </dl>
              ) : null}

              {/* Cooking steps */}
              {recipe.steps && recipe.steps.length > 0 ? (
                <div className="border-t border-[#eee8df] pt-4">
                  <h3 className="text-sm font-medium text-[#2f2a24]">{t("cookingSteps")}</h3>
                  <ol className="mt-3 space-y-2 text-sm text-[#625b52]">
                    {recipe.steps.map((step: string, i: number) => (
                      <li key={i} className="flex gap-2">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#f5f0ea] text-xs font-medium text-[#7b6f61]">
                          {i + 1}
                        </span>
                        <span className="pt-0.5">{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              ) : null}
            </div>
          </div>

          <PostSidebar
            post={post}
            hasTheme={hasTheme}
            forkLabel={t("forkTitle")}
            forkDescription={t("forkDescription")}
            authorLabel={t("author")}
            themeLabel={t("theme")}
            forksLabel={t("forks")}
            startForkLabel={t("startFork")}
            editLabel={t("edit")}
          />
        </div>

        <CommentSection postId={post.id} />
      </section>
    </AppShell>
  );
}

function isMeaningfulRecipe(post: RecipePost) {
  const recipe = post.recipe;
  return (
    getUsefulIngredients(post).length > 0 ||
    recipe.equipment.length > 0 ||
    recipe.tags.length > 0 ||
    Boolean(getUsefulNotes(post)) ||
    recipe.cook_time_minutes !== 30 ||
    recipe.estimated_cost !== 10
  );
}

function getUsefulIngredients(post: RecipePost) {
  return post.recipe.ingredients.filter(
    (ingredient) => normalizeText(ingredient) !== normalizeText(post.title),
  );
}

function getUsefulNotes(post: RecipePost) {
  const notes = post.recipe.notes.trim();
  if (!notes) {
    return "";
  }

  const normalizedNotes = normalizeText(notes);
  const normalizedDescription = normalizeText(post.description);
  if (
    normalizedNotes === normalizedDescription ||
    normalizedDescription.includes(normalizedNotes) ||
    normalizedNotes.includes(normalizedDescription) ||
    isMostlyCoveredByDescription(notes, normalizedDescription)
  ) {
    return "";
  }
  return notes;
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, "").toLowerCase();
}

function isMostlyCoveredByDescription(notes: string, normalizedDescription: string) {
  const noteParts = notes
    .split(/[，,。.!！？?；;]/)
    .map((part) => normalizeText(part))
    .filter((part) => part.length >= 3);

  if (noteParts.length === 0) {
    return false;
  }

  const coveredParts = noteParts.filter((part) =>
    normalizedDescription.includes(part),
  ).length;
  return coveredParts / noteParts.length >= 0.6;
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[#6f6a61]">{label}</dt>
      <dd className="mt-1 leading-6 text-[#2f2a24]">{value}</dd>
    </div>
  );
}
