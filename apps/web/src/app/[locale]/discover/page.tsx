import { getTranslations } from "next-intl/server";

import { AppShell } from "@/components/app-shell";
import { PostGridPaginated } from "@/components/post-grid-paginated";
import { loadPosts } from "@/lib/posts";

export default async function DiscoverPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Home" });
  const { posts, total } = await loadPosts();

  return (
    <AppShell>
      <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-[#2f2a24]">{t("title")}</h1>
          <p className="mt-2 text-sm text-[#6f6a61]">
            {t("postCount", { count: total })}
          </p>
        </div>
        <PostGridPaginated initialPosts={posts} totalCount={total} />
      </section>
    </AppShell>
  );
}
