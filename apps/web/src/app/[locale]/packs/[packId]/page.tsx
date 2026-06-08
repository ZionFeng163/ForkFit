import { notFound } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { PackDetailContent } from "@/components/pack-detail-content";
import { loadPost } from "@/lib/posts";

type PageProps = {
  params: Promise<{ locale: string; packId: string }>;
};

export default async function PackDetailPage({ params }: PageProps) {
  const { locale, packId } = await params;
  const post = await loadPost(packId);

  if (!post) {
    notFound();
  }

  return (
    <AppShell>
      <PackDetailContent post={post} locale={locale} />
    </AppShell>
  );
}
