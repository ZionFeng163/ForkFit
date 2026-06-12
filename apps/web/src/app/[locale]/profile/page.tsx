"use client";

import { useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { Calendar, Edit, Loader2, MapPin, Plus, Star, Users } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { AuthGuard } from "@/components/auth-guard";
import { useAuth } from "@/components/auth-provider";
import { PostCard } from "@/components/post-card";
import { Link } from "@/i18n/routing";
import {
  listSavedPosts,
  listUserPosts,
  listFollowing,
  listFollowers,
  getFollowStats,
  getUserProfile,
  updateMe,
} from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import type { RecipePost } from "@/types/forkfit";

type Tab = "recipes" | "saved" | "following" | "followers";

export default function ProfilePage() {
  return (
    <AuthGuard>
      <AppShell>
        <ProfileContent />
      </AppShell>
    </AuthGuard>
  );
}

function ProfileContent() {
  const locale = useLocale();
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("recipes");
  const [profile, setProfile] = useState<{ post_count: number; bio: string; location: string; created_at?: string } | null>(null);
  const [stats, setStats] = useState({ followers: 0, following: 0 });
  const [totalLikes, setTotalLikes] = useState(0);

  // Edit state
  const [editing, setEditing] = useState(false);
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editBio, setEditBio] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    getUserProfile(user.id).then(setProfile).catch(() => {});
    getFollowStats().then(setStats).catch(() => {});
    // Calculate total likes from user's own posts (sum of saves on their posts)
    listUserPosts(user.id, 100, 0).then((res) => {
      setTotalLikes(res.posts.reduce((sum, p) => sum + p.saves, 0));
    }).catch(() => {});
  }, [user]);

  function startEdit() {
    setEditDisplayName(user?.display_name || "");
    setEditBio(profile?.bio || "");
    setEditLocation(profile?.location || "");
    setEditing(true);
  }

  async function saveProfile() {
    setSaving(true);
    setError(null);
    try {
      await updateMe({
        display_name: editDisplayName || user?.display_name || "",
        bio: editBio,
        location: editLocation,
      });
      // Refresh user data
      if (user) {
        const updated = await getUserProfile(user.id);
        setProfile(updated);
      }
      setEditing(false);
    } catch (error: unknown) {
      setError(errorMessage(error, "保存失败"));
    }
    setSaving(false);
  }

  if (!user) return null;

  const postCount = profile?.post_count ?? 0;

  return (
    <div className="mx-auto max-w-[960px] px-7 pb-20">
      {/* Profile header */}
      <div className="flex gap-8 items-start py-8" style={{ borderBottom: "1px solid var(--lp-border)" }}>
        <div className="relative flex-shrink-0">
          <div
            className="w-24 h-24 rounded-full grid place-items-center text-[36px] font-bold"
            style={{
              background: "var(--lp-accent-soft)",
              color: "var(--lp-accent)",
              border: "3px solid var(--lp-surface)",
              boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
            }}
          >
            {user.avatar_url ? (
              <img src={user.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
            ) : (
              (user.display_name || user.username || "?")[0].toUpperCase()
            )}
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1.5">
            <h1 className="text-[22px] font-bold tracking-[-0.01em]" style={{ color: "var(--lp-fg)" }}>
              {editing ? editDisplayName || user.display_name : (user.display_name || user.username)}
            </h1>
            {profile && profile.post_count > 0 && (
              <span
                className="inline-flex items-center gap-1 px-2.5 py-[3px] rounded-full text-[11px] font-semibold"
                style={{ background: "var(--lp-accent-light)", color: "var(--lp-accent)" }}
              >
                <Star size={12} fill="currentColor" />
                {locale === "en" ? "Active creator" : "活跃创作者"}
              </span>
            )}
          </div>
          {editing ? (
            <div className="space-y-3 mb-3 max-w-[480px]">
              <div>
                <label className="block text-[13px] font-semibold mb-1" style={{ color: "var(--lp-fg)" }}>显示名称</label>
                <input
                  value={editDisplayName}
                  onChange={(e) => setEditDisplayName(e.target.value)}
                  placeholder="你的名字"
                  className="w-full h-[38px] px-3.5 rounded-lg text-sm outline-none"
                  style={{ border: "1.5px solid var(--lp-border)", background: "var(--lp-surface)", color: "var(--lp-fg)" }}
                />
              </div>
              <div>
                <label className="block text-[13px] font-semibold mb-1" style={{ color: "var(--lp-fg)" }}>简介</label>
                <input
                  value={editBio}
                  onChange={(e) => setEditBio(e.target.value)}
                  placeholder="写点什么介绍自己..."
                  className="w-full h-[38px] px-3.5 rounded-lg text-sm outline-none"
                  style={{ border: "1.5px solid var(--lp-border)", background: "var(--lp-surface)", color: "var(--lp-fg)" }}
                />
              </div>
              <div>
                <label className="block text-[13px] font-semibold mb-1" style={{ color: "var(--lp-fg)" }}>地点</label>
                <input
                  value={editLocation}
                  onChange={(e) => setEditLocation(e.target.value)}
                  placeholder="例如：上海"
                  className="w-full h-[38px] px-3.5 rounded-lg text-sm outline-none"
                  style={{ border: "1.5px solid var(--lp-border)", background: "var(--lp-surface)", color: "var(--lp-fg)" }}
                />
              </div>
            </div>
          ) : (
            <>
              {profile?.bio && (
                <p className="text-sm leading-[1.6] mb-3 max-w-[480px]" style={{ color: "var(--lp-fg-secondary, var(--lp-muted))" }}>
                  {profile.bio}
                </p>
              )}
              <div className="flex items-center gap-4 text-[13px] flex-wrap" style={{ color: "var(--lp-muted)" }}>
                <span className="flex items-center gap-1.5">
                  <span className="text-xs" style={{ color: "var(--lp-muted)" }}>@{user.username}</span>
                </span>
                {profile?.location && (
                  <span className="flex items-center gap-1.5">
                    <MapPin size={14} />
                    {profile.location}
                  </span>
                )}
                <span className="flex items-center gap-1.5">
                  <Calendar size={14} />
                  {locale === "en" ? "Joined" : "加入于"} {profile?.created_at ? new Date(profile.created_at).getFullYear() : new Date().getFullYear()}
                </span>
              </div>
            </>
          )}
        </div>

        {error && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] px-5 py-3 rounded-xl text-sm font-medium text-white" style={{ background: "#e0524a" }}>
            {error}
            <button onClick={() => setError(null)} className="ml-3 opacity-70 hover:opacity-100">×</button>
          </div>
        )}

        <div className="flex-shrink-0 flex gap-2">
          {editing ? (
            <>
              <button
                onClick={saveProfile}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg text-[13px] font-semibold text-white transition-all duration-150 disabled:opacity-50"
                style={{ background: "var(--lp-accent)" }}
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : null}
                保存
              </button>
              <button
                onClick={() => setEditing(false)}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg text-[13px] font-semibold transition-all duration-150"
                style={{ border: "1px solid var(--lp-border)", background: "var(--lp-surface)", color: "var(--lp-fg-secondary, var(--lp-muted))" }}
              >
                取消
              </button>
            </>
          ) : (
            <button
              onClick={startEdit}
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg text-[13px] font-semibold transition-all duration-150"
              style={{ border: "1px solid var(--lp-border)", background: "var(--lp-surface)", color: "var(--lp-fg)" }}
            >
              <Edit size={14} />
              编辑资料
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="flex gap-8 py-6">
        <div className="flex flex-col gap-0.5">
          <div className="text-xl font-bold" style={{ fontVariantNumeric: "tabular-nums" }}><span style={{ color: "var(--lp-accent)" }}>{postCount}</span></div>
          <div className="text-[13px]" style={{ color: "var(--lp-muted)" }}>发布菜谱</div>
        </div>
        <div className="flex flex-col gap-0.5">
          <div className="text-xl font-bold" style={{ fontVariantNumeric: "tabular-nums" }}><span style={{ color: "var(--lp-accent)" }}>{totalLikes.toLocaleString()}</span></div>
          <div className="text-[13px]" style={{ color: "var(--lp-muted)" }}>获赞</div>
        </div>
        <div className="flex flex-col gap-0.5">
          <div className="text-xl font-bold" style={{ fontVariantNumeric: "tabular-nums" }}><span style={{ color: "var(--lp-accent)" }}>{stats.followers}</span></div>
          <div className="text-[13px]" style={{ color: "var(--lp-muted)" }}>粉丝</div>
        </div>
        <div className="flex flex-col gap-0.5">
          <div className="text-xl font-bold" style={{ fontVariantNumeric: "tabular-nums" }}><span style={{ color: "var(--lp-accent)" }}>{stats.following}</span></div>
          <div className="text-[13px]" style={{ color: "var(--lp-muted)" }}>关注</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 mb-6" style={{ borderBottom: "1px solid var(--lp-border)" }}>
        {(["recipes", "saved", "following", "followers"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="px-5 py-3 text-sm font-medium transition-all duration-150 relative"
            style={{
              color: tab === t ? "var(--lp-accent)" : "var(--lp-muted)",
              fontWeight: tab === t ? 600 : 500,
              borderBottom: tab === t ? "2px solid var(--lp-accent)" : "2px solid transparent",
            }}
          >
            {t === "recipes" && "我的菜谱"}
            {t === "saved" && "收藏"}
            {t === "following" && "关注"}
            {t === "followers" && "粉丝"}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "recipes" && <RecipesTab userId={user.id} />}
      {tab === "saved" && <SavedTab />}
      {tab === "following" && <FollowingTab userId={user.id} />}
      {tab === "followers" && <FollowersTab userId={user.id} />}
    </div>
  );
}

/* ── Recipes Tab ── */
function RecipesTab({ userId }: { userId: string }) {
  const [posts, setPosts] = useState<RecipePost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listUserPosts(userId, 50, 0).then((res) => setPosts(res.posts)).finally(() => setLoading(false));
  }, [userId]);

  if (loading) return <Spinner />;
  if (posts.length === 0) return <Empty message="还没有发布菜谱" actionHref="/posts/new" actionLabel="发布第一道" />;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {posts.map((post) => <PostCard key={post.id} post={post} />)}
    </div>
  );
}

/* ── Saved Tab ── */
function SavedTab() {
  const [posts, setPosts] = useState<RecipePost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listSavedPosts(50, 0).then(setPosts).finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;
  if (posts.length === 0) return <Empty message="还没有收藏菜谱" actionHref="/discover" actionLabel="去发现" />;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {posts.map((post) => <PostCard key={post.id} post={post} />)}
    </div>
  );
}

/* ── Following Tab ── */
function FollowingTab({ userId }: { userId: string }) {
  const [users, setUsers] = useState<{ id: string; username: string; display_name: string; avatar_url: string | null }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listFollowing(userId, 50, 0).then((res) => setUsers(res.users)).finally(() => setLoading(false));
  }, [userId]);

  if (loading) return <Spinner />;
  if (users.length === 0) return <Empty message="还没有关注任何人" actionHref="/discover" actionLabel="去发现" />;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {users.map((u) => <FollowCard key={u.id} user={u} />)}
    </div>
  );
}

/* ── Followers Tab ── */
function FollowersTab({ userId }: { userId: string }) {
  const [users, setUsers] = useState<{ id: string; username: string; display_name: string; avatar_url: string | null }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listFollowers(userId, 50, 0).then((res) => setUsers(res.users)).finally(() => setLoading(false));
  }, [userId]);

  if (loading) return <Spinner />;
  if (users.length === 0) return <Empty message="还没有粉丝" />;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {users.map((u) => <FollowCard key={u.id} user={u} />)}
    </div>
  );
}

/* ── Follow Card ── */
function FollowCard({ user: u }: { user: { id: string; username: string; display_name: string; avatar_url: string | null } }) {
  return (
    <Link href={`/users/${u.id}`}>
      <div
        className="flex items-center gap-3.5 p-4 rounded-xl transition-all duration-200"
        style={{ background: "var(--lp-surface)", border: "1px solid var(--lp-border)" }}
        onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.04)")}
        onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "none")}
      >
        <div
          className="w-11 h-11 rounded-full grid place-items-center text-base font-bold flex-shrink-0"
          style={{ background: "var(--lp-warm-100)", color: "var(--lp-fg-secondary, var(--lp-muted))" }}
        >
          {u.avatar_url ? (
            <img src={u.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
          ) : (
            (u.display_name || u.username || "?")[0].toUpperCase()
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold" style={{ color: "var(--lp-fg)" }}>{u.display_name || u.username}</div>
          <div className="text-xs truncate" style={{ color: "var(--lp-muted)" }}>@{u.username}</div>
        </div>
      </div>
    </Link>
  );
}

/* ── Shared UI ── */
function Spinner() {
  return (
    <div className="py-12 text-center">
      <Loader2 size={24} className="animate-spin mx-auto" style={{ color: "var(--lp-muted)" }} />
    </div>
  );
}

function Empty({ message, actionHref, actionLabel }: { message: string; actionHref?: string; actionLabel?: string }) {
  return (
    <div className="py-20 text-center">
      <div className="w-16 h-16 rounded-full grid place-items-center mx-auto mb-4" style={{ background: "var(--lp-warm-100)" }}>
        <Users size={28} style={{ color: "var(--lp-muted)" }} />
      </div>
      <h3 className="text-base font-semibold mb-1.5" style={{ color: "var(--lp-fg)" }}>{message}</h3>
      {actionHref && actionLabel && (
        <Link
          href={actionHref}
          className="inline-flex items-center gap-1.5 mt-3 px-5 py-2.5 rounded-lg text-[13px] font-semibold text-white transition-all duration-150"
          style={{ background: "var(--lp-accent)" }}
        >
          <Plus size={14} />
          {actionLabel}
        </Link>
      )}
    </div>
  );
}
