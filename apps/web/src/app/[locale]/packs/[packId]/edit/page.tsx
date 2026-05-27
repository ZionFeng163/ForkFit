import { notFound } from "next/navigation";

import { AppShell } from "@/components/app-shell";
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
      <section className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <PostEditorForm post={post} />
      </section>
    </AppShell>
  );
}
