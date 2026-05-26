import { ArrowLeft, Clock, DollarSign, GitFork, MapPin } from "lucide-react";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/routing";
import { loadPost } from "@/lib/posts";

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
            <div className="flex snap-x gap-3 overflow-x-auto bg-[#eee9e2] p-3">
              {post.image_urls.map((imageUrl, index) => (
                <div
                  key={imageUrl}
                  className="relative aspect-[16/11] w-full min-w-full snap-center overflow-hidden rounded-md bg-[#e5ded5]"
                >
                  <Image
                    src={imageUrl}
                    alt={`${post.title} ${index + 1}`}
                    fill
                    priority={index === 0}
                    sizes="(max-width: 1024px) 100vw, 760px"
                    className="object-cover"
                  />
                </div>
              ))}
            </div>
            <div className="space-y-5 p-5">
              <div>
                <h1 className="text-2xl font-semibold tracking-0">{post.title}</h1>
                <p className="mt-2 text-sm leading-6 text-[#625b52]">
                  {post.description}
                </p>
              </div>

              <div className="grid gap-3 border-y border-[#eee8df] py-4 text-sm text-[#5f5a52] sm:grid-cols-3">
                <span className="flex items-center gap-2">
                  <Clock size={16} />
                  {t("minutes", { count: recipe.cook_time_minutes })}
                </span>
                <span className="flex items-center gap-2">
                  <DollarSign size={16} />
                  {recipe.estimated_cost.toFixed(0)}
                </span>
                <span className="flex items-center gap-2">
                  <MapPin size={16} />
                  {post.location}
                </span>
              </div>

              <article className="rounded-lg border border-[#e8e1d8] p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold">{recipe.name}</h2>
                  </div>
                  <p className="text-sm text-[#625b52]">
                    {recipe.cook_time_minutes}m
                  </p>
                </div>
                <div className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
                  <div>
                    <h3 className="font-medium">{t("ingredients")}</h3>
                    <p className="mt-1 leading-6 text-[#625b52]">
                      {recipe.ingredients.join(", ")}
                    </p>
                  </div>
                  <div>
                    <h3 className="font-medium">{t("equipment")}</h3>
                    <p className="mt-1 leading-6 text-[#625b52]">
                      {recipe.equipment.length ? recipe.equipment.join(", ") : t("none")}
                    </p>
                  </div>
                </div>
                {recipe.notes ? (
                  <p className="mt-4 border-t border-[#eee8df] pt-3 text-sm leading-6 text-[#625b52]">
                    {recipe.notes}
                  </p>
                ) : null}
              </article>
            </div>
          </div>

          <aside className="h-fit rounded-lg border border-[#e4ded6] bg-white p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{t("forkTitle")}</h2>
                <p className="mt-1 text-sm leading-6 text-[#625b52]">
                  {t("forkDescription")}
                </p>
              </div>
              <GitFork size={20} />
            </div>
            <dl className="mt-5 space-y-3 border-y border-[#eee8df] py-4 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-[#6f6a61]">{t("author")}</dt>
                <dd>{post.author}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[#6f6a61]">{t("theme")}</dt>
                <dd>{post.theme}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[#6f6a61]">{t("forks")}</dt>
                <dd>{post.forks}</dd>
              </div>
            </dl>
            <Button asChild className="mt-5 w-full">
              <Link href={`/packs/${post.id}/fork`}>{t("startFork")}</Link>
            </Button>
          </aside>
        </div>
      </section>
    </AppShell>
  );
}
