import { getTranslations } from "next-intl/server";

import { AppShell } from "@/components/app-shell";
import { MyPostsList } from "./my-posts-list";
import { listPosts } from "@/lib/api";

export default async function MyPostsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "MyPosts" });
  const allPosts = await listPosts(100, 0);
  const myPosts = allPosts.filter((p) => p.user_id === "demo_user");

  return (
    <AppShell>
      <section className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
        <h1 className="mb-6 text-lg font-semibold">{t("title")}</h1>
        <MyPostsList posts={myPosts} />
      </section>
    </AppShell>
  );
}
