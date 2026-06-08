import { notFound } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { AuthGuard } from "@/components/auth-guard";
import { loadPost } from "@/lib/posts";
import { ForkContent } from "./fork-form";

type PageProps = {
  params: Promise<{ packId: string }>;
};

export default async function ForkPage({ params }: PageProps) {
  const { packId } = await params;
  const post = await loadPost(packId);

  if (!post) {
    notFound();
  }

  return (
    <AppShell>
      <AuthGuard>
        <ForkContent post={post} />
      </AuthGuard>
    </AppShell>
  );
}
