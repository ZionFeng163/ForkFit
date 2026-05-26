import { notFound } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { mealPackFromPost } from "@/lib/meal-pack";
import { loadPost } from "@/lib/posts";
import { ForkForm } from "./fork-form";

type PageProps = {
  params: Promise<{ locale: string; packId: string }>;
};

export default async function ForkPage({ params }: PageProps) {
  const { packId } = await params;
  const post = await loadPost(packId);

  if (!post) {
    notFound();
  }

  return (
    <AppShell>
      <section className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <ForkForm mealPack={mealPackFromPost(post)} />
      </section>
    </AppShell>
  );
}
