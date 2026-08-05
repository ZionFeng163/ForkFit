"use client";

import { useEffect, useState } from "react";
import { Loader2, UserPlus, UserCheck } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { PostCard } from "@/components/post-card";
import { RemoteImage } from "@/components/remote-image";
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

  const [followError, setFollowError] = useState<string | null>(null);

  function handleFollow() {
    if (!currentUser || followLoading) return;
    setFollowLoading(true);
    setFollowError(null);
    const fn = isFollowing ? unfollowUser : followUser;
    fn(userId).then(() => {
      setIsFollowing(!isFollowing);
    }).catch((e) => {
      setFollowError(e.message || "操作失败");
    }).finally(() => setFollowLoading(false));
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 size={24} className="animate-spin" style={{ color: "var(--muted)" }} />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="py-20 text-center" style={{ color: "var(--muted)" }}>
        <p>用户不存在</p>
      </div>
    );
  }

  const isOwnProfile = currentUser?.id === userId;

  return (
    <section className="site-container max-w-[980px] pb-20">
      {/* Profile header */}
      <div className="flex gap-8 items-start py-8" style={{ borderBottom: "1px solid var(--separator)" }}>
        <div
          className="w-24 h-24 rounded-full grid place-items-center text-[36px] font-bold flex-shrink-0"
          style={{
            background: "var(--brand-soft)",
            color: "var(--brand)",
            border: "3px solid var(--surface)",
            boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
          }}
        >
          {profile.avatar_url ? (
            <RemoteImage src={profile.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
          ) : (
            (profile.display_name || profile.username)[0].toUpperCase()
          )}
        </div>

        <div className="flex-1 min-w-0">
          <h1 className="text-[22px] font-bold tracking-[-0.01em] mb-1" style={{ color: "var(--text)" }}>
            {profile.display_name || profile.username}
          </h1>
          <div className="text-[13px]" style={{ color: "var(--muted)" }}>
            @{profile.username} · {profile.post_count} 篇菜谱
          </div>
        </div>

        {!isOwnProfile && currentUser && (
          <button
            onClick={handleFollow}
            disabled={followLoading}
            className="flex-shrink-0 inline-flex items-center gap-1.5 px-5 py-2 rounded-lg text-[13px] font-semibold transition-all duration-150 disabled:opacity-50"
            style={{
              background: isFollowing ? "var(--surface)" : "var(--brand)",
              color: isFollowing ? "var(--muted, var(--muted))" : "white",
              border: isFollowing ? "1px solid var(--separator)" : "none",
            }}
            onMouseEnter={(e) => {
              if (isFollowing) { e.currentTarget.style.borderColor = "var(--danger)"; e.currentTarget.style.color = "var(--danger)"; e.currentTarget.style.background = "var(--danger-soft)"; }
            }}
            onMouseLeave={(e) => {
              if (isFollowing) { e.currentTarget.style.borderColor = "var(--separator)"; e.currentTarget.style.color = "var(--muted, var(--muted))"; e.currentTarget.style.background = "var(--surface)"; }
            }}
          >
            {isFollowing ? <UserCheck size={14} /> : <UserPlus size={14} />}
            {isFollowing ? "已关注" : "关注"}
          </button>
        )}
        {followError && (
          <div className="app-toast fixed bottom-6 left-1/2 z-[200] -translate-x-1/2 px-5 py-3 text-sm font-medium text-white" style={{ background: "var(--danger)" }}>
            {followError}
            <button onClick={() => setFollowError(null)} className="ml-3 opacity-70 hover:opacity-100">×</button>
          </div>
        )}
      </div>

      {/* Posts */}
      {posts.length === 0 ? (
        <div className="py-20 text-center">
          <p className="text-sm" style={{ color: "var(--muted)" }}>暂无帖子</p>
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
