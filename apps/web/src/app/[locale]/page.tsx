import { getTranslations } from "next-intl/server";

import { AppShell } from "@/components/app-shell";
import { PostGridPaginated } from "@/components/post-grid-paginated";
import { loadPosts } from "@/lib/posts";
import { HeroSection } from "@/components/hero-section";
import { FeaturesSection } from "@/components/features-section";
import { HowItWorksSection } from "@/components/how-it-works-section";

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Home" });
  const { posts, total } = await loadPosts();

  return (
    <AppShell>
      {/* Landing Page Sections */}
      <HeroSection />
      <FeaturesSection />
      <HowItWorksSection />

      {/* Posts Grid */}
      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <div className="mb-8 text-center">
          <h2 className="text-2xl font-semibold text-[#2f2a24]">{t("postCount", { count: total })}</h2>
          <p className="mt-2 text-sm text-[#6f6a61]">发现社区里的美味菜谱</p>
        </div>
        <PostGridPaginated initialPosts={posts} totalCount={total} />
      </section>
    </AppShell>
  );
}
