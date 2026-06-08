import { notFound } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { AuthGuard } from "@/components/auth-guard";
import { loadPost } from "@/lib/posts";
import { PostEditorForm } from "../../../posts/new/post-editor-form";

type PageProps = {
  params: Promise<{ packId: string }>;
};

export default async function EditPostPage({ params }: PageProps) {
  const { packId } = await params;
  const post = await loadPost(packId);

  if (!post) {
    notFound();
  }

  return (
    <AppShell>
      <AuthGuard>
        <PostEditorForm post={post} />
      </AuthGuard>
    </AppShell>
  );
}
