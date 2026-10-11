import { notFound } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { PackDetailContent } from "@/components/pack-detail-content";
import { loadPost } from "@/lib/posts";

type PageProps = {
  params: Promise<{ locale: string; packId: string }>;
  searchParams: Promise<{ returnTo?: string }>;
};

export default async function PackDetailPage({ params, searchParams }: PageProps) {
  const { locale, packId } = await params;
  const post = await loadPost(packId);
  const { returnTo } = await searchParams;
  const backHref = typeof returnTo === "string" && /^\/discover(?:\?|$)/.test(returnTo) ? returnTo : "/discover";

  if (!post) {
    notFound();
  }

  return (
    <AppShell>
      <PackDetailContent post={post} locale={locale} backHref={backHref} />
    </AppShell>
  );
}
