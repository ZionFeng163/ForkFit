"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { PostCard } from "@/components/post-card";
import { getUserProfile, listUserPosts } from "@/lib/api";
import type { RecipePost } from "@/types/forkfit";

type UserProfile = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  post_count: number;
};

export default function UserPublicProfile({ params }: { params: Promise<{ userId: string }> }) {
  return (
    <AppShell>
      <UserProfileContent params={params} />
    </AppShell>
  );
}

function UserProfileContent({ params }: { params: Promise<{ userId: string }> }) {
  const t = useTranslations("UserProfile");
  const [userId, setUserId] = useState<string>("");
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [posts, setPosts] = useState<RecipePost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    params.then((p) => setUserId(p.userId));
  }, [params]);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    Promise.all([
      getUserProfile(userId),
      listUserPosts(userId, 50, 0),
    ])
      .then(([profileRes, postsRes]) => {
        setProfile(profileRes);
        setPosts(postsRes.posts);
      })
      .finally(() => setLoading(false));
  }, [userId]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 size={24} className="animate-spin text-[#9f9890]" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="py-20 text-center text-[#6f6a61]">
        <p>{t("notFound")}</p>
      </div>
    );
  }

  return (
    <section className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <div className="mb-8 flex items-center gap-4">
        {profile.avatar_url ? (
          <img
            src={profile.avatar_url}
            alt={profile.display_name}
            className="h-16 w-16 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#e4ded6] text-xl font-medium text-[#6f6a61]">
            {(profile.display_name || profile.username)[0].toUpperCase()}
          </div>
        )}
        <div>
          <h1 className="text-xl font-semibold">{profile.display_name}</h1>
          <p className="text-sm text-[#6f6a61]">@{profile.username}</p>
          <p className="mt-1 text-sm text-[#6f6a61]">
            {t("postCount", { count: profile.post_count })}
          </p>
        </div>
      </div>

      {posts.length === 0 ? (
        <p className="py-12 text-center text-sm text-[#9f9890]">{t("noPosts")}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      )}
    </section>
  );
}
