"use client";

import { useEffect, useState } from "react";
import { Loader2, UserPlus, UserCheck } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { PostCard } from "@/components/post-card";
import { useAuth } from "@/components/auth-provider";
import {
  getUserProfile,
  listUserPosts,
  followUser,
  unfollowUser,
  listFollowing,
} from "@/lib/api";
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
  const { user: currentUser } = useAuth();
  const [userId, setUserId] = useState<string>("");
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [posts, setPosts] = useState<RecipePost[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);

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

  // Check follow status
  useEffect(() => {
    if (!userId || !currentUser || userId === currentUser.id) return;
    listFollowing(currentUser.id, 100, 0).then((res) => {
      setIsFollowing(res.users.some((u) => u.id === userId));
    }).catch(() => {});
  }, [userId, currentUser]);

  function handleFollow() {
    if (!currentUser || followLoading) return;
    setFollowLoading(true);
    const fn = isFollowing ? unfollowUser : followUser;
    fn(userId).then(() => {
      setIsFollowing(!isFollowing);
    }).finally(() => setFollowLoading(false));
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 size={24} className="animate-spin" style={{ color: "var(--lp-muted)" }} />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="py-20 text-center" style={{ color: "var(--lp-muted)" }}>
        <p>用户不存在</p>
      </div>
    );
  }

  const isOwnProfile = currentUser?.id === userId;

  return (
    <section className="mx-auto max-w-[960px] px-7 pb-20">
      {/* Profile header */}
      <div className="flex gap-8 items-start py-8" style={{ borderBottom: "1px solid var(--lp-border)" }}>
        <div
          className="w-24 h-24 rounded-full grid place-items-center text-[36px] font-bold flex-shrink-0"
          style={{
            background: "var(--lp-accent-soft)",
            color: "var(--lp-accent)",
            border: "3px solid var(--lp-surface)",
            boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
          }}
        >
          {profile.avatar_url ? (
            <img src={profile.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
          ) : (
            (profile.display_name || profile.username)[0].toUpperCase()
          )}
        </div>

        <div className="flex-1 min-w-0">
          <h1 className="text-[22px] font-bold tracking-[-0.01em] mb-1" style={{ color: "var(--lp-fg)" }}>
            {profile.display_name || profile.username}
          </h1>
          <div className="text-[13px]" style={{ color: "var(--lp-muted)" }}>
            @{profile.username} · {profile.post_count} 篇菜谱
          </div>
        </div>

        {!isOwnProfile && currentUser && (
          <button
            onClick={handleFollow}
            disabled={followLoading}
            className="flex-shrink-0 inline-flex items-center gap-1.5 px-5 py-2 rounded-lg text-[13px] font-semibold transition-all duration-150 disabled:opacity-50"
            style={{
              background: isFollowing ? "var(--lp-surface)" : "var(--lp-accent)",
              color: isFollowing ? "var(--lp-fg-secondary, var(--lp-muted))" : "white",
              border: isFollowing ? "1px solid var(--lp-border)" : "none",
            }}
            onMouseEnter={(e) => {
              if (isFollowing) { e.currentTarget.style.borderColor = "#e44"; e.currentTarget.style.color = "#e44"; e.currentTarget.style.background = "#fef2f2"; }
            }}
            onMouseLeave={(e) => {
              if (isFollowing) { e.currentTarget.style.borderColor = "var(--lp-border)"; e.currentTarget.style.color = "var(--lp-fg-secondary, var(--lp-muted))"; e.currentTarget.style.background = "var(--lp-surface)"; }
            }}
          >
            {isFollowing ? <UserCheck size={14} /> : <UserPlus size={14} />}
            {isFollowing ? "已关注" : "关注"}
          </button>
        )}
      </div>

      {/* Posts */}
      {posts.length === 0 ? (
        <div className="py-20 text-center">
          <p className="text-sm" style={{ color: "var(--lp-muted)" }}>暂无帖子</p>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      )}
    </section>
  );
}
