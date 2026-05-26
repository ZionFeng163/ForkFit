import { getTranslations } from "next-intl/server";

import { AppShell } from "@/components/app-shell";
import { PostGrid } from "@/components/post-grid";
import { loadPosts } from "@/lib/posts";

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Home" });
  const posts = await loadPosts();

  return (
    <AppShell>
      <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-0">{t("title")}</h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-[#6f6a61]">
              {t("description")}
            </p>
          </div>
          <div className="hidden text-sm text-[#6f6a61] sm:block">
            {t("postCount", { count: posts.length })}
          </div>
        </div>
        <PostGrid posts={posts} />
      </section>
    </AppShell>
  );
}
