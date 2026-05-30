"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { AuthGuard } from "@/components/auth-guard";
import { useAuth } from "@/components/auth-provider";
import { MyPostsList } from "./my-posts-list";
import { listPosts } from "@/lib/api";
import type { RecipePost } from "@/types/forkfit";

export default function MyPostsPage() {
  const t = useTranslations("MyPosts");
  const { user } = useAuth();
  const [posts, setPosts] = useState<RecipePost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    listPosts(100, 0)
      .then((all) => setPosts(all.filter((p) => p.user_id === user.id)))
      .finally(() => setLoading(false));
  }, [user]);

  return (
    <AuthGuard>
      <AppShell>
        <section className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
          <h1 className="mb-6 text-lg font-semibold">{t("title")}</h1>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 size={24} className="animate-spin text-[#9f9890]" />
            </div>
          ) : (
            <MyPostsList posts={posts} />
          )}
        </section>
      </AppShell>
    </AuthGuard>
  );
}
