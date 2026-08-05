"use client";

import { useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { Calendar, Edit, Loader2, MapPin, Plus, Star, Users } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { AuthGuard } from "@/components/auth-guard";
import { useAuth } from "@/components/auth-provider";
import { PostCard } from "@/components/post-card";
import { RemoteImage } from "@/components/remote-image";
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
    <div className="site-container max-w-[980px] pb-20">
      {/* Profile header */}
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-4 gap-y-5 py-8 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:gap-8" style={{ borderBottom: "1px solid var(--separator)" }}>
        <div className="relative flex-shrink-0">
          <div
            className="grid h-20 w-20 place-items-center rounded-full text-[30px] font-bold sm:h-24 sm:w-24 sm:text-[36px]"
            style={{
              background: "var(--brand-soft)",
              color: "var(--brand)",
              border: "3px solid var(--surface)",
              boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
            }}
          >
            {user.avatar_url ? (
              <RemoteImage src={user.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
            ) : (
              (user.display_name || user.username || "?")[0].toUpperCase()
            )}
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="mb-1.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5">
            <h1 className="min-w-0 break-words text-[21px] font-bold tracking-[-0.01em] sm:text-[22px]" style={{ color: "var(--text)" }}>
              {editing ? editDisplayName || user.display_name : (user.display_name || user.username)}
            </h1>
            {profile && profile.post_count > 0 && (
              <span
                className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold"
                style={{ background: "var(--brand-soft)", color: "var(--brand)" }}
              >
                <Star size={12} fill="currentColor" />
                {locale === "en" ? "Active creator" : "活跃创作者"}
              </span>
            )}
          </div>
          {editing ? (
            <div className="space-y-3 mb-3 max-w-[480px]">
              <div>
                <label className="block text-[13px] font-semibold mb-1" style={{ color: "var(--text)" }}>显示名称</label>
                <input
                  value={editDisplayName}
                  onChange={(e) => setEditDisplayName(e.target.value)}
                  placeholder="你的名字"
                  className="w-full h-[38px] px-3.5 rounded-lg text-sm outline-none"
                  style={{ border: "1.5px solid var(--separator)", background: "var(--surface)", color: "var(--text)" }}
                />
              </div>
              <div>
                <label className="block text-[13px] font-semibold mb-1" style={{ color: "var(--text)" }}>简介</label>
                <input
                  value={editBio}
                  onChange={(e) => setEditBio(e.target.value)}
                  placeholder="写点什么介绍自己..."
                  className="w-full h-[38px] px-3.5 rounded-lg text-sm outline-none"
                  style={{ border: "1.5px solid var(--separator)", background: "var(--surface)", color: "var(--text)" }}
                />
              </div>
              <div>
                <label className="block text-[13px] font-semibold mb-1" style={{ color: "var(--text)" }}>地点</label>
                <input
                  value={editLocation}
                  onChange={(e) => setEditLocation(e.target.value)}
                  placeholder="例如：上海"
                  className="w-full h-[38px] px-3.5 rounded-lg text-sm outline-none"
                  style={{ border: "1.5px solid var(--separator)", background: "var(--surface)", color: "var(--text)" }}
                />
              </div>
            </div>
          ) : (
            <>
              {profile?.bio && (
                <p className="text-sm leading-[1.6] mb-3 max-w-[480px]" style={{ color: "var(--muted, var(--muted))" }}>
                  {profile.bio}
                </p>
              )}
              <div className="flex items-center gap-4 text-[13px] flex-wrap" style={{ color: "var(--muted)" }}>
                <span className="flex items-center gap-1.5">
                  <span className="text-xs" style={{ color: "var(--muted)" }}>@{user.username}</span>
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
          <div className="app-toast fixed bottom-6 left-1/2 z-[200] -translate-x-1/2 px-5 py-3 text-sm font-medium text-white" style={{ background: "var(--danger)" }}>
            {error}
            <button onClick={() => setError(null)} className="ml-3 opacity-70 hover:opacity-100">×</button>
          </div>
        )}

        <div className="col-span-2 flex flex-shrink-0 gap-2 sm:col-span-1 sm:col-start-3 sm:row-start-1">
          {editing ? (
            <>
              <button
                onClick={saveProfile}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg text-[13px] font-semibold text-white transition-all duration-150 disabled:opacity-50"
                style={{ background: "var(--brand)" }}
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : null}
                保存
              </button>
              <button
                onClick={() => setEditing(false)}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg text-[13px] font-semibold transition-all duration-150"
                style={{ border: "1px solid var(--separator)", background: "var(--surface)", color: "var(--muted, var(--muted))" }}
              >
                取消
              </button>
            </>
          ) : (
            <button
              onClick={startEdit}
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg text-[13px] font-semibold transition-all duration-150"
              style={{ border: "1px solid var(--separator)", background: "var(--surface)", color: "var(--text)" }}
            >
              <Edit size={14} />
              编辑资料
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="flex flex-wrap gap-6 py-6 sm:gap-8">
        <div className="flex flex-col gap-0.5">
          <div className="text-xl font-bold" style={{ fontVariantNumeric: "tabular-nums" }}><span style={{ color: "var(--brand)" }}>{postCount}</span></div>
          <div className="text-[13px]" style={{ color: "var(--muted)" }}>发布菜谱</div>
        </div>
        <div className="flex flex-col gap-0.5">
          <div className="text-xl font-bold" style={{ fontVariantNumeric: "tabular-nums" }}><span style={{ color: "var(--brand)" }}>{totalLikes.toLocaleString()}</span></div>
          <div className="text-[13px]" style={{ color: "var(--muted)" }}>获赞</div>
        </div>
        <div className="flex flex-col gap-0.5">
          <div className="text-xl font-bold" style={{ fontVariantNumeric: "tabular-nums" }}><span style={{ color: "var(--brand)" }}>{stats.followers}</span></div>
          <div className="text-[13px]" style={{ color: "var(--muted)" }}>粉丝</div>
        </div>
        <div className="flex flex-col gap-0.5">
          <div className="text-xl font-bold" style={{ fontVariantNumeric: "tabular-nums" }}><span style={{ color: "var(--brand)" }}>{stats.following}</span></div>
          <div className="text-[13px]" style={{ color: "var(--muted)" }}>关注</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-0 overflow-x-auto" style={{ borderBottom: "1px solid var(--separator)" }}>
        {(["recipes", "saved", "following", "followers"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="relative shrink-0 px-4 py-3 text-sm font-medium transition-all duration-150 sm:px-5"
            style={{
              color: tab === t ? "var(--brand)" : "var(--muted)",
              fontWeight: tab === t ? 600 : 500,
              borderBottom: tab === t ? "2px solid var(--brand)" : "2px solid transparent",
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
        className="flex items-center gap-3.5 p-4 rounded-lg transition-all duration-200"
        style={{ background: "var(--surface)", border: "1px solid var(--separator)" }}
        onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.04)")}
        onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "none")}
      >
        <div
          className="w-11 h-11 rounded-full grid place-items-center text-base font-bold flex-shrink-0"
          style={{ background: "var(--surface-soft)", color: "var(--muted, var(--muted))" }}
        >
          {u.avatar_url ? (
            <RemoteImage src={u.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
          ) : (
            (u.display_name || u.username || "?")[0].toUpperCase()
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold" style={{ color: "var(--text)" }}>{u.display_name || u.username}</div>
          <div className="text-xs truncate" style={{ color: "var(--muted)" }}>@{u.username}</div>
        </div>
      </div>
    </Link>
  );
}

/* ── Shared UI ── */
function Spinner() {
  return (
    <div className="py-12 text-center">
      <Loader2 size={24} className="animate-spin mx-auto" style={{ color: "var(--muted)" }} />
    </div>
  );
}

function Empty({ message, actionHref, actionLabel }: { message: string; actionHref?: string; actionLabel?: string }) {
  return (
    <div className="py-20 text-center">
      <div className="w-16 h-16 rounded-full grid place-items-center mx-auto mb-4" style={{ background: "var(--surface-soft)" }}>
        <Users size={28} style={{ color: "var(--muted)" }} />
      </div>
      <h3 className="text-base font-semibold mb-1.5" style={{ color: "var(--text)" }}>{message}</h3>
      {actionHref && actionLabel && (
        <Link
          href={actionHref}
          className="inline-flex items-center gap-1.5 mt-3 px-5 py-2.5 rounded-lg text-[13px] font-semibold text-white transition-all duration-150"
          style={{ background: "var(--brand)" }}
        >
          <Plus size={14} />
          {actionLabel}
        </Link>
      )}
    </div>
  );
}
