import { getTranslations } from "next-intl/server";

import { AppShell } from "@/components/app-shell";
import { PostGridPaginated } from "@/components/post-grid-paginated";
import { loadPosts } from "@/lib/posts";

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Home" });
  const { posts, total } = await loadPosts();

  return (
    <AppShell>
      <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {/* Hero */}
        <div className="mb-6 rounded-xl border border-[#e4ded6] bg-gradient-to-br from-[#faf8f5] to-white p-6 sm:p-8">
          <h1 className="text-2xl font-semibold tracking-0">{t("title")}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#6f6a61]">
            {t("heroDescription")}
          </p>
          <div className="mt-4 flex flex-wrap gap-3 text-xs text-[#7a7167]">
            <span className="inline-flex items-center gap-1 rounded-full bg-white border border-[#e4ded6] px-3 py-1">🍳 {t("heroStep1")}</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-white border border-[#e4ded6] px-3 py-1">⚡ {t("heroStep2")}</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-white border border-[#e4ded6] px-3 py-1">🍽️ {t("heroStep3")}</span>
          </div>
        </div>

        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <p className="text-sm text-[#6f6a61]">
              {t("postCount", { count: total })}
            </p>
          </div>
        </div>
        <PostGridPaginated initialPosts={posts} totalCount={total} />
      </section>
    </AppShell>
  );
}
